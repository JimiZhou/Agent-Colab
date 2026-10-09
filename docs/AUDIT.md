# v0.1 baseline audit

Baseline main: `76778d7ac03fb74b24cd01829960fc85429b6698` (2026-10-09).
Read README, SKILL, entire server, dashboard, Dockerfile and Compose. No AGENTS.md.
`npm test`: succeeds with **zero tests**. `node --check src/server.js`: passes. Runtime Node 24.19.

## Findings
- JSON: single-process promise queue serializes writes, tmp rename mitigates partial writes. No multi-process locking/transactions; failed promise poisons future saves; memory mutates before durable success.
- Credentials: random bearer tokens stored plaintext; no expiry/revocation, scopes or participant identity. Admin is global environment credential.
- Authorization: writes are project-scoped; reads expose all content publicly; task references unvalidated. No read-only membership. Public agent serialization correctly omits token.
- CORS: wildcard read access and authorization headers; no explicit origin policy. Error handler exposes exception messages.
- Tasks: creation only, no claims/leases/dependencies or state transitions.
- Reviews: self-agent voting blocked but multiple agents of one human count independently. No reproduction evidence requirement, revocation or separation between governance and reproduction.
- Data: unbounded arrays/full snapshots, no migrations, indexes or relational integrity. No MCP (REST only), SSE or GitHub links.
- UI: safe text escaping and real REST data; read-only polling, no join/configuration or evidence drilldown.
- Docker: named data volume exists; no healthcheck, non-root user or dependency/build stage. SQLite portability not applicable yet.

## Phased implementation / P0
1. TypeScript boundaries; SQLite WAL migrations, participants separate from agents, scoped hashed expiring credentials, transactional writes, idempotency, legacy import.
2. Official SDK Streamable HTTP MCP tools/resources; authenticated, bounded, same core as REST.
3. Public opt-in share page and discovery; private default; owner-issued participant-bound invitations; full skill and truthful harness instructions.
4. Atomic exclusive claims, leases/heartbeat/release/expiry, dependencies, audited state machine.
5. Evidence/reproduction reviews, participant deduplication, owner/community policies, disputes/revocation; distinguish recognition from reported reproduction.
6. React/Vite responsive light dashboard using REST, event refresh and actions, join and permissions.
7. GitHub repository/commit/branch/PR link validation only, no remote execution or Git writes.
8. Local/Docker/Tunnel docs, persistence/backup, Workers D1 and Vercel limitations ADR.
9. Automated core/API/MCP integration tests, deterministic A/B/C collaboration demo, CI, security checks and draft PR.

Each phase is committed separately after its checks. P1: OAuth participant identity, cryptographic/Sybil-resistant independence, GitHub OAuth/webhooks, D1 adapter, hosted multi-instance storage, actual Codex/Claude live acceptance (requires installed clients and user-configured credentials).
