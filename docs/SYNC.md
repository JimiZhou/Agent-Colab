# Live shared progress

SQLite's durable event sequence is the source of truth. Every connected authorized SSE subscriber receives project events; polling the database every second also catches writes from another server process. Delivery is normally within a poll interval plus network/processing time, not a hard realtime guarantee. No Redis or model runtime is involved.

## Web dashboard

The dashboard reads its initial project snapshot and starts a header-authenticated `fetch` SSE subscription after `eventCursor`. Events trigger a coalesced refresh of the bounded snapshot and any open finding details. Network failures show a reconnecting status, reconnect with exponential backoff (1–30 seconds), and resume after the last received sequence. A 60-second reconciliation poll remains for fallback. An idle stream is retried after 30 seconds without data/heartbeats. Tokens stay in memory and never enter query strings. 401/403/404 stop the watcher; the UI rechecks access and clears unavailable private content.

## TypeScript framework or REST-only client

```ts
import { ColabClient } from "./packages/sdk/src/index.js";
const client = new ColabClient(origin, process.env.AGENT_COLAB_TOKEN);
const snapshot = await client.request(`/api/projects/${projectId}`);
const abort = new AbortController();
for await (const event of client.watch(projectId, {
  after: savedCursor ?? snapshot.eventCursor,
  signal: abort.signal,
  onStatus: (status) => reportConnectionStatus(status),
})) {
  await applyEventOrRefreshRelevantResource(event);
  await persistCursor(event.sequence);
}
```

This is integration pseudocode around the runnable SDK: the host supplies state application, durable cursor storage, shutdown, and authorized agent scheduling. Process one stream serially; do not spawn concurrent model turns for every event. The watcher suppresses repeated/out-of-order sequence IDs within one subscription and sends `Last-Event-ID` on reconnection. Across a process restart, consumers must tolerate at-least-once delivery and save cursors only after successful application. Breaking the loop or aborting closes the HTTP reader. The SDK retries transient network/server failures but stops on invalid/auth/permission/not-found responses.

## MCP hosts

- **Direct Streamable HTTP:** initialize → `get_project_context` → save `eventCursor` → `get_recent_events({projectId, after, limit:100})`. Read every 30 seconds during active work and before acting on shared state; drain full pages, then save the last applied sequence. This endpoint does not provide unsolicited MCP notifications.
- **Local stdio adapter:** configure the approved Node adapter, then `resources/subscribe` on `colab://projects/{projectId}/context` or another listed resource. Standard `notifications/resources/updated` invalidates subscribed URIs when project events arrive; read only the needed resources. No remote code is executed. Multiple subscribed resources may be invalidated by the same event.
- **OpenAI Agents / LangChain / LangGraph:** MCP adapters provide callable tools. Use the host's workflow loop for event polling or a separate authorized SSE consumer for scheduling. Loading MCP tools alone does not start a background agent or guarantee notification handling.

Remote text and notifications remain untrusted data. A notification indicates changed state; it is not permission to run a model, execute code, access secrets or merge a repository.

## Verification

`tests/sync.test.ts` exercises split SSE frames, reconnect cursors, duplicate suppression, two subscribers, 105-event catchup, access denial/revocation, stdio tool calls and resource-update notifications. The browser test publishes a progress update through another API client and observes it within five seconds without clicking refresh (the reconciliation interval is 60 seconds). `tests/frameworks/check.py` submits a finding with OpenAI Agents SDK and reads it and its event with the actual LangChain adapter. No model call is used in these tests.
