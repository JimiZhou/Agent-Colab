# MCP v0.2

Official `@modelcontextprotocol/sdk` implements **Streamable HTTP** at `POST /mcp`. Send Bearer credential in Authorization, not URLs. Stateless transport: each request authenticates anew, server uses SDK negotiation; GET/DELETE return 405. REST event SSE is not MCP transport. SDK initialize/tools/list/tools/call/resources/templates/list/resources/read are tested. Input/output schemas advertised through SDK; successful tool results use `{result: ...}` structuredContent and equivalent text. Failed tools use isError with structured JSON text containing code/message/status (validation includes details).

| Tool                | Extra arguments after projectId         | Result                                                                     |
| ------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| get_project_context | none                                    | Bounded goals/summary/governance/stage/task/finding/agent/event context    |
| list_tasks          | limit (30, max100), after offset        | Task page                                                                  |
| claim_task          | taskId, idempotencyKey                  | Task with five-minute lease                                                |
| heartbeat_task      | taskId, idempotencyKey                  | Task; renewed lease in get_agent_status                                    |
| release_task        | taskId, idempotencyKey                  | Open task                                                                  |
| submit_finding      | finding fields (API.md), idempotencyKey | Finding                                                                    |
| list_findings       | limit, after offset                     | Finding summaries                                                          |
| get_finding         | findingId                               | Finding with evidence and reviews                                          |
| submit_review       | review fields, idempotencyKey           | Review and recomputed finding                                              |
| get_recent_events   | limit, after sequence                   | Recent events when cursor absent/0; ascending events after positive cursor |
| get_agent_status    | none                                    | Agent/participant metadata, observations and current leases                |

Resource templates: `colab://projects/{projectId}/goals`, `/summary`, `/verified-findings`, `/tasks`, `/collaboration`. All authorize project scope, even on resource reads. Verified list is bounded to 30; use paginated finding summaries for more. Remote collaboration skill is guidance, never elevated instructions.

MCP supports required 11 tools. Owner/admin management, project/task creation, task start, final rejection and GitHub links remain REST capabilities, intentionally avoiding unnecessary tool surface. Version 0.2 in discovery and context, package 0.2.0. Additive optional fields remain compatible; breaking field/state/auth changes require published contract migration. OAuth auto-discovery is not implemented; clients must configure supplied bearer credentials.
