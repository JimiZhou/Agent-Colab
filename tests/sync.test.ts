import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { Colab } from "../packages/core/src/service.js";
import { createApp } from "../apps/server/src/app.js";
import {
  ColabClient,
  watchProjectEvents,
  SyncAccessError,
} from "../packages/sdk/src/index.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ResourceUpdatedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
const admin = { credentialId: "admin", participantId: "admin", admin: true };
const secret = "sync-test-admin-secret-32-characters";
async function fixture() {
  const c = new Colab(":memory:", secret);
  const project = c.write(admin, "project", "create", {}, () =>
    c.createProject(admin, { name: "Sync", goal: "Keep everyone updated" }),
  );
  const invite = c.write(admin, "join", "join", {}, () =>
    c.join(admin, project.id, { name: "Agent", participantName: "Human" }),
  );
  const server = createApp(c).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    c,
    project,
    invite,
    server,
    base,
    client: new ColabClient(base, invite.token),
    close: () => {
      server.closeAllConnections();
      server.close();
      c.close();
    },
  };
}
test(
  "SSE client parses split CRLF frames, suppresses duplicates and resumes after disconnect",
  { timeout: 10000 },
  async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      seen.push(req.headers["last-event-id"] as string);
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const event = (sequence: number) =>
        `id: ${sequence}\r\nevent: activity\r\ndata: ${JSON.stringify({ id: String(sequence), sequence, type: "task.created", at: "now" })}\r\n\r\n`;
      if (seen.length === 1) {
        const frame = event(1);
        res.write(frame.slice(0, -1));
        setTimeout(() => res.end(frame.slice(-1)), 10);
      } else res.end(event(1) + event(2));
    }).listen(0, "127.0.0.1");
    await once(server, "listening");
    const abort = new AbortController();
    try {
      const received: number[] = [];
      for await (const event of watchProjectEvents(
        `http://127.0.0.1:${(server.address() as { port: number }).port}`,
        "test",
        { signal: abort.signal, retryMs: 10 },
      )) {
        received.push(event.sequence);
        if (received.length === 2) break;
      }
      assert.deepEqual(received, [1, 2]);
      assert.deepEqual(seen, ["0", "1"]);
    } finally {
      abort.abort();
      server.closeAllConnections();
      server.close();
    }
  },
);
test(
  "two subscribers receive updates, replay more than one page and stop on revoked access",
  { timeout: 15000 },
  async () => {
    const f = await fixture();
    const abort = new AbortController();
    const cursor = f.c.context(
      f.c.authenticate(f.invite.token),
      f.project.id,
    ).eventCursor;
    const streams = [
      f.client.watch(f.project.id, {
        after: cursor,
        signal: abort.signal,
        retryMs: 10,
      }),
      f.client.watch(f.project.id, {
        after: cursor,
        signal: abort.signal,
        retryMs: 10,
      }),
    ];
    try {
      const next = streams.map((s) => s.next());
      await f.client.request(`/api/projects/${f.project.id}/tasks`, {
        title: "Broadcast to both",
      });
      const events = await Promise.all(next);
      assert.equal(events[0].value?.type, "task.created");
      assert.equal(events[0].value?.sequence, events[1].value?.sequence);
      const last = events[0].value!.sequence;
      for (let i = 0; i < 105; i++)
        f.c.write(admin, `bulk-${i}`, "task", {}, () =>
          f.c.task(admin, f.project.id, { title: `Catchup ${i}` }),
        );
      const replay = f.client.watch(f.project.id, {
        after: last,
        signal: abort.signal,
        retryMs: 10,
      });
      let count = 0;
      for await (const event of replay) {
        assert.ok(event.sequence > last);
        if (++count === 105) break;
      }
      assert.equal(count, 105);
      f.c.write(admin, "revoke", "revoke", {}, () =>
        f.c.revoke(admin, f.project.id, f.invite.credential.id),
      );
      await assert.rejects(
        f.client.watch(f.project.id, { signal: abort.signal }).next(),
        SyncAccessError,
      );
      const foreign = f.c.write(admin, "foreign", "create", {}, () =>
        f.c.createProject(admin, { name: "Private", goal: "Other" }),
      );
      const publicClient = new ColabClient(f.base);
      await assert.rejects(
        publicClient.watch(foreign.id, { signal: abort.signal }).next(),
        SyncAccessError,
      );
    } finally {
      abort.abort();
      await Promise.all(streams.map((s) => s.return(undefined)));
      f.close();
    }
  },
);
test(
  "stdio adapter initializes, defaults project, forwards writes, subscribes and rejects foreign resources",
  { timeout: 20000 },
  async () => {
    const f = await fixture();
    const client = new Client({ name: "stdio-test", version: "1" });
    try {
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: ["--import", "tsx", "scripts/mcp-stdio.ts"],
          env: {
            ...Object.fromEntries(
              Object.entries(process.env).filter(
                (entry): entry is [string, string] => entry[1] !== undefined,
              ),
            ),
            AGENT_COLAB_URL: f.base,
            AGENT_COLAB_PROJECT: f.project.id,
            AGENT_COLAB_TOKEN: f.invite.token,
          },
          stderr: "pipe",
        }),
      );
      const tools = await client.listTools();
      assert.equal(tools.tools.length, 11);
      assert.equal(
        tools.tools[0].inputSchema.required?.includes("projectId"),
        false,
      );
      const result = await client.callTool({
        name: "get_project_context",
        arguments: {},
      });
      assert.equal((result.structuredContent as any).result.id, f.project.id);
      const resources = await client.listResources();
      assert.equal(resources.resources.length, 6);
      const uri = `colab://projects/${f.project.id}/context`;
      let resolveUpdate!: (value: string) => void;
      const updated = new Promise<string>((resolve) => {
        resolveUpdate = resolve;
      });
      client.setNotificationHandler(
        ResourceUpdatedNotificationSchema,
        (notification) => resolveUpdate(notification.params.uri),
      );
      await client.subscribeResource({ uri });
      const task = await f.client.request(
        `/api/projects/${f.project.id}/tasks`,
        { title: "Live notification" },
      );
      assert.equal(await updated, uri);
      const context = await client.readResource({ uri });
      assert.match(
        String("text" in context.contents[0] ? context.contents[0].text : ""),
        /Live notification/,
      );
      const claim = await client.callTool({
        name: "claim_task",
        arguments: { taskId: task.id, idempotencyKey: crypto.randomUUID() },
      });
      assert.equal(claim.isError, undefined);
      assert.equal((claim.structuredContent as any).result.status, "claimed");
      await assert.rejects(
        client.readResource({ uri: "colab://projects/foreign/context" }),
      );
      const denied = await client
        .callTool({
          name: "get_project_context",
          arguments: { projectId: crypto.randomUUID() },
        })
        .catch((e) => e);
      assert.ok(denied instanceof Error || denied.isError);
      await client.unsubscribeResource({ uri });
    } finally {
      await client.close();
      f.close();
    }
  },
);
