import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ColabClient } from "../packages/sdk/src/index.js";
const base = process.env.BASE_URL || "http://localhost:8787";
const token = process.env.ADMIN_TOKEN;
if (!token) throw Error("Set ADMIN_TOKEN for the running server");
const owner = new ColabClient(base, token);
const project = await owner.request("/api/projects", {
  name: "Independent arithmetic study",
  goal: "Independently reproduce 2 + 2 = 4 and preserve the evidence chain",
  summary:
    "A submitted a deterministic experiment; B and C independently validated it.",
  stage: "Validation",
  mode: "community",
  public: true,
});
const clients: Client[] = [];
try {
  const agents = [];
  for (const name of ["Agent A", "Agent B", "Agent C"])
    agents.push(
      await owner.request(`/api/projects/${project.id}/join`, {
        name,
        participantName: name.replace("Agent", "Participant"),
        harness: "deterministic-mcp-client",
      }),
    );
  for (const a of agents) {
    const client = new Client({ name: a.agent.name, version: "0.2" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
        requestInit: { headers: { Authorization: "Bearer " + a.token } },
      }),
    );
    clients.push(client);
  }
  const call = async (i: number, name: string, args: any, write = false) => {
    const r = await clients[i].callTool({
      name,
      arguments: {
        projectId: project.id,
        ...args,
        ...(write ? { idempotencyKey: crypto.randomUUID() } : {}),
      },
    });
    if (r.isError) throw Error(JSON.stringify(r.content));
    return (r.structuredContent as any).result;
  };
  await call(0, "get_project_context", {});
  const researcher = new ColabClient(base, agents[0].token);
  const task = await researcher.request(`/api/projects/${project.id}/tasks`, {
    title: "Reproduce integer addition",
    description:
      "Evaluate 2 + 2 independently; retain environment and assertion evidence.",
  });
  await call(0, "list_tasks", {});
  await call(0, "claim_task", { taskId: task.id }, true);
  await researcher.request(
    `/api/projects/${project.id}/tasks/${task.id}/start`,
    {},
  );
  assert.equal(2 + 2, 4);
  const finding = await call(
    0,
    "submit_finding",
    {
      title: "2 + 2 = 4",
      summary: "Integer arithmetic reproduced with a deterministic assertion",
      direction: "Arithmetic",
      taskId: task.id,
      method: "Node integer addition and strict assertion",
      evidence: [
        { description: "assert.equal(2 + 2, 4) passed in " + process.version },
      ],
      reproduction:
        "Run node --input-type=module -e \"import assert from 'node:assert/strict'; assert.equal(2+2,4)\"",
    },
    true,
  );
  for (const i of [1, 2]) {
    await call(i, "get_project_context", {});
    await call(i, "get_finding", { findingId: finding.id });
    assert.equal(2 + 2, 4);
    await call(
      i,
      "submit_review",
      {
        findingId: finding.id,
        vote: "approve",
        environment: `Node ${process.version} on ${process.platform}/${process.arch}`,
        evidence: `Independent deterministic client ${i} executed assert.equal(2 + 2, 4): passed`,
        reproduced: true,
        notes:
          "No model API used; deterministic client, not a real harness acceptance test.",
      },
      true,
    );
  }
  const final = await call(0, "get_finding", { findingId: finding.id });
  assert.equal(final.status, "verified");
  assert.equal(final.reviews.length, 2);
  console.log(
    JSON.stringify(
      {
        shareUrl: base + "/p/" + project.id,
        projectId: project.id,
        findingId: finding.id,
        status: final.status,
        recognition: final.recognition,
        reproductionStatus: final.reproductionStatus,
        reviews: final.reviews.length,
      },
      null,
      2,
    ),
  );
} finally {
  await Promise.all(clients.map((c) => c.close()));
}
