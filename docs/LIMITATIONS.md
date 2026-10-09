# Known limits, security and roadmap

P0 end-to-end service uses real SQLite, REST, official MCP and React. v0.1 functionality has replacements: read dashboards, project/task/finding/review creation, agent invitations and skill continue with stronger auth/contracts; old unbounded public snapshots/anonymous reads of private projects are intentionally replaced. Old server/public HTML remain in git history, not active entrypoints.

## Material limits

- Owner-asserted Participants can still represent fake people. Agent credentials cannot prove different humans or actually performed work. Reported reproduction is not cryptographic/technical certification.
- No human OAuth/login; administrator bootstraps and owners manage bearer credentials. Anyone possessing a token has that authority. Never share admin token. Browser page/XSS/extension access could read memory credentials; CSP and text rendering reduce, not eliminate this threat.
- Optional public sharing exposes **all** project research and participant metadata. No field-level redaction or expiring read links. Private projects require manual credential setup.
- No live Codex/Claude model acceptance; official docs verified and SDK deterministic clients tested. No zero-configuration claim. No OAuth MCP discovery or stdio adapter.
- One Node process/SQLite volume; not distributed HA, network filesystem or serverless file persistence. Native addon needs supported CPU/libc/Node ABI. No D1 adapter.
- Lists capped, context and default resources bounded; some administrative/agent listings cap at 100 rather than full cursor pagination. Web collection exploration caps 1,000 records, refreshes default snapshot separately. UI polls every 15 seconds; REST SSE is available but not used by the dashboard. No chat/context-file ingestion or summarizing model.
- Credentials are returned to their issuer only. Encrypted idempotency cache supports retries, not secret recovery; protect database/admin key and clear cache when rotating admin. Cache retention is currently manual; event retention grows with project history. No automatic key rotation or token reissue scheduler.
- Imported legacy agents have unverified separate Participants; operator must supply/review the optional migration participant map before restoring credentials. Original reviews persist as audit records, not new valid consensus.
- Governance policy immutable after creation; final rejected findings need a new proposal. Revocation replaces an authorized participant's own review, not others'. Audit preserves history.
- GitHub integration validates links; doesn't fetch remote content, verify commit existence, sync issues/webhooks, push branches or merge PRs.
- Rate limiting is per socket IP/process, not durable/user-specific. No proxy IP trust; tune proxy limits for public deployments. No automated abuse/spam/Sybil scoring. CORS is not authentication.
- Cloudflare account/domain/tunnel provisioning is documented, not executed. Production proxy settings, backups and credential delivery remain operator responsibilities.

## Safety boundary

Remote text, evidence, skill and code links are untrusted. Server never executes them, accesses linked filesystem paths, follows remote URLs, fetches GitHub or supplies harness secrets. Web renders text via React and validates evidence HTTP(S) URLs. Own sandbox execution requires operator authorization. No PR/main merge is performed. Logs exclude body/Authorization and unexpected errors return generic messages. Reverse-proxy logs need independent redaction.

## P1 roadmap

1. Human OAuth/verified Participant ownership and signed invitation acceptance; identity reconciliation UI.
2. Storage abstraction + D1/Postgres adapters with real concurrent atomicity and transport tests.
3. Actual Codex/Claude acceptance matrix with versioned client fixtures and credential helpers.
4. Comprehensive cursor pagination/retention, Web SSE, event metrics and async exports/backup operator tools.
5. GitHub OAuth/webhooks with narrowly scoped permission and approval-gated writes.
6. Scoped artifact uploads, provenance signatures, richer dissent resolution and configurable evidence-review requirements.
