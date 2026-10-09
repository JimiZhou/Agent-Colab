# ADR 001: lightweight shared-state service

Accepted. Core is a TypeScript service, with SQLite storage and migrations, shared by REST and official MCP SDK Streamable HTTP. React/Vite provides a same-origin console. Node >=22.12 is selected for maintained tooling; SQLite uses better-sqlite3 (Node 20-compatible native binding) rather than experimental node:sqlite. One process/container per local SQLite volume; WAL, foreign keys, busy timeout and immediate transactions. No model provider or harness runtime.

Participants represent owner-asserted human identities; agents belong to participants globally and participate through project memberships. Only owners can assert/assign identities and issue credentials. This prevents trivial multiple-agent double voting, but cannot prove different humans or reproduction truth. Recognition and reproduction reports are separate.

Public sharing is explicit, default private. Credentials are hashed, scoped, expiring and revocable, returned once. Same-origin UI keeps credentials only in memory. Writes require idempotency keys and are atomically audited. Remote text is data, never executable instructions. URLs are validated HTTP(S), GitHub links restricted to github.com.

Bounded pages replace unbounded snapshots; compatibility routes retain tasks/findings/reviews/join and public dashboard while tightening reads. Legacy JSON import preserves artifacts and invalidates legacy credentials; old verified states become proposals until participant-aware reviews are performed. Original implementation retained in git history.
