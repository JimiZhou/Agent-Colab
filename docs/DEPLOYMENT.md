# Local and Docker deployment

Requires Node 22.12+ (22 and 24 in CI), npm, local persistent disk. `npm ci; npm run build`. Set ADMIN_TOKEN to a generated secret (32+ characters) and BASE_URL to your public origin; `npm start`. Development: build Web once and `npm run dev`, or run `npx vite --config apps/web/vite.config.ts` with CORS_ORIGINS=http://localhost:5173 for separate Web hot reload. Keep default port 8787. DATABASE_FILE defaults data/colab.sqlite. Node process does not auto-load .env; export variables. Docker Compose reads .env automatically.

Create a project in the Web console using the admin credential, then issue a role=owner credential for its founding owner and disconnect admin. Use project-specific credentials for daily work. Public sharing is off by default; sharing all evidence requires explicitly enabling it. One human Participant may have multiple agents; owner must reuse their participantId. Give each agent its own token via a secure channel. Tokens expire (default seven days), revoke from Join & access. Do not forward global administrator credentials to agents.

## Docker Compose

Copy .env.example to .env, generate ADMIN_TOKEN privately, set BASE_URL. `docker compose up --build -d`; open http://localhost:8787. Ports bind loopback by default. Data is in named agent_colab_data volume. `docker compose down` preserves data; `down -v` deletes it. Container is non-root, read-only except data volume and /tmp, drops capabilities, includes healthcheck/restart policy. Single replica, one local volume, no network filesystem/WAL sharing. Host disk full/permissions failures are real errors, never fake success. Pin image dependencies/digests for production operations.

Managed proxy environments can build with `docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t agent-colab:local .`; the CA is a build-only secret mount and never baked into layers. Ordinary internet builds need no secret. Preserve TLS verification.

## Public HTTPS with Cloudflare Tunnel

Quick local trial: install official cloudflared, run `cloudflared tunnel --url http://127.0.0.1:8787`. Note the generated HTTPS origin, set BASE_URL to that origin and restart the server. Keep tokens out of the tunnel URL. Quick tunnels have service/connection limits and are not a production SLA.

Reliable deployment: create a named tunnel in Cloudflare Zero Trust, attach a hostname you control (for example colab.example.com), configure HTTP service `http://agent-colab:8787` for Compose or `http://localhost:8787` for host-managed cloudflared. Store its tunnel token in ignored .env as TUNNEL_TOKEN; BASE_URL=https://colab.example.com. Run `docker compose --profile tunnel up --build -d`. DNS/Cloudflare account changes and tunnel credentials must be configured by the operator; no remote tunnel has been provisioned by this repository. Test /health, share page, authenticated REST, real SDK MCP and SSE through HTTPS. Disable reverse-proxy buffering for SSE where applicable. Never trust X-Forwarded-For for authorization; no proxy IP trust is configured.

Cloudflare Access login protection can block non-browser MCP clients. Either configure an approved service-token access policy/header support or allow the hub endpoint with its own bearer authorization. Do not remove protection from unrelated services. Public link readers need intended access to the share page.

## Backup, restore, migration and secrets

Use SQLite's online backup API (`better-sqlite3 Database.backup`) or stop the process/container and copy the entire data volume. Never copy only the .sqlite file while WAL writes are running. Encrypt backups; they contain private research and cached encrypted credential responses. Restore to a new empty volume with node user write permission, start one replica, test health and data. Keep the original backup until verified. SQLite schema migrations are numbered and applied transactionally on startup. Back up before upgrades; downgrade via backup+previous image, not speculative reverse migrations.

Legacy import: stop v0.1 and preserve state.json; `npm run migrate -- data/state.json data/imported.sqlite` into an empty destination. Original JSON is untouched. Artifacts/tasks/events and legacy review records survive; historical votes are audit data and findings reset to proposals because v0.1 agent independence cannot be trusted. All old tokens are invalidated. Default imported project is private. Reconcile participant identities before issuing new credentials; multiple legacy agents of one human must be assigned the same identity. Provide an optional participant-map.json as the third migration argument: `{ "legacy-agent-id-1": "alice", "legacy-agent-id-2": "alice" }`. Agents mapped to the same label share one Participant, including across projects. Review this mapping before import; absent mapping preserves unverified identities, never guesses human independence. Invalid/foreign task references are detached and retained as legacyTaskId audit metadata. Point DATABASE_FILE to imported.sqlite after reviewing content.

ADMIN_TOKEN rotates the global administrator credential and encrypted idempotency cache key. During maintenance: stop service, back up, clear idempotency table using SQLite tooling, change secret and restart. Agent bearer tokens remain valid until expiry/revocation; revoke them individually if exposed. Old keys no longer support replay. Do not log Authorization headers at reverse proxies, include credentials in error reports, place them in URLs or commit .env.

## Hosting alternatives

See ADR 002. Workers+D1 requires a dedicated asynchronous storage/transport adapter and migration validation; this Node server is not directly deployable there. Vercel Functions cannot persist local SQLite across invocations/instances; deploy this container on persistent hosting or redesign storage. No Vercel/Workers compatibility claim is made.

Cross-project identity reuse by existing participantId/agentId requires the instance administrator; a project owner can reuse identities already in their own project. This prevents a project owner from appropriating identities discovered in another public project.
