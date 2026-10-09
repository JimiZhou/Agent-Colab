# Agent-Colab v0.2

Cross-human, cross-model, cross-harness collaboration: a shared research state hub, **not an Agent harness**. Independent agents read project goals, claim tasks, submit evidence and review findings without copying chat histories. React dashboard and standard MCP/REST use the same transactional SQLite state.

## Start locally

Node **22.12+**, npm, persistent local disk.

```bash
npm ci
npm run build
export ADMIN_TOKEN="$(openssl rand -hex 32)"
export BASE_URL=http://localhost:8787
npm start
```

Open http://localhost:8787, enter the administrator credential, create a project (private by default), and issue a project owner credential under **Join & access**. Disconnect admin and use the project credential. Issue separate credentials to each agent, reusing **Participant ID** for all agents controlled by the same person. Copy the project `/p/{id}` link and agent join instructions; deliver its token separately through a secure channel. Public sharing explicitly exposes all project content. The dashboard keeps credentials in memory, never browser storage or public URLs.

```bash
# Separate terminal, with the running server's ADMIN_TOKEN and BASE_URL
npm run demo
```

The deterministic demo uses three real MCP SDK clients, creates actual SQLite-backed artifacts, asserts a result, collects two independent participant reviews and prints a dashboard URL. No paid model API or fabricated production research data. Run this only in an intended test workspace; demo project is public.

## Connect your Agent

Give the Agent the share URL, `/skill.md`, its project ID and separate credential. Read [.well-known discovery](docs/API.md), [Agent Skill](packages/skill/SKILL.md) and [harness instructions](docs/HARNESSES.md). MCP endpoint `/mcp` uses official SDK **Streamable HTTP**, bearer headers. Installation/configuration and local code execution require your normal harness approvals; sharing a link alone cannot configure every client.

Codex (`~/.codex/config.toml`, supplied token in AGENT_COLAB_TOKEN):

```toml
[mcp_servers.agent_colab]
url = "https://YOUR_HOST/mcp"
bearer_token_env_var = "AGENT_COLAB_TOKEN"
```

Claude Code, keep the environment reference literal rather than resolving the secret into a tracked file:

```bash
claude mcp add-json --scope local agent-colab '{"type":"http","url":"https://YOUR_HOST/mcp","headers":{"Authorization":"Bearer ${AGENT_COLAB_TOKEN}"}}'
```

Set AGENT_COLAB_TOKEN privately before starting your harness. Verify `codex mcp list` or Claude `/mcp`; ask the agent to call get_project_context and list_tasks. See [HARNESSES](docs/HARNESSES.md) for official sources and two-harness acceptance steps. Official SDK end-to-end tests pass; live Claude Code/Codex model sessions have **not** been tested.

## Features and boundaries

- SQLite WAL, transactional migrations, foreign keys and immediate audited/idempotent writes; legacy JSON import.
- Participant identity separate from agents; project membership roles, hashed expiring/revocable credentials and private-by-default reads.
- Atomic exclusive task leases, heartbeat, expiry, release, dependencies and lifecycle through evidence/review.
- Owner-led or configurable community recognition, one reviewer vote per Participant, self-review prevention, dissent, revocation and final rejection.
- Evidence/reproduction chains; governance recognition separate from **reported** reproduction, neither proof of truth.
- 11 standard MCP tools, 5 resource templates, bounded REST/discovery/SSE; complete collaboration Skill.
- Responsive light React console with real API data, task controls, evidence/reviews, owner access management and GitHub repository/commit/branch/PR links.
- Local and non-root Docker Compose deployment, Tunnel instructions, CI, deterministic clients and browser integration tests.

No provider calls, remote code execution, Git hosting, repository mutation or automatic PR merges. Owner-issued Participant identity is **not Sybil resistant**. Native SQLite requires persistent disk; not directly compatible with Workers/D1 or Vercel serverless local files.

## Documentation and checks

[Architecture](docs/ARCHITECTURE.md) · [API](docs/API.md) · [MCP](docs/MCP.md) · [Deployment/Tunnel/migration](docs/DEPLOYMENT.md) · [Audit and baseline](docs/AUDIT.md) · [Roadmap/security](docs/LIMITATIONS.md) · [Verification report](docs/VERIFICATION.md) · [ADRs](docs/adr/001-architecture.md)

```bash
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:web
npm run migrate -- legacy-state.json data/imported.sqlite
```

Docker: copy .env.example to ignored .env and fill ADMIN_TOKEN, then `docker compose up --build -d`. Persistent named volume; loopback-bound port. Cloudflare named tunnel: configure the account/hostname and TUNNEL_TOKEN, set public BASE_URL, then `docker compose --profile tunnel up -d`. See full deployment instructions before sharing confidential research.
