# ADR 002: persistent self-hosted Docker first

Accepted. Default Node/Express + native better-sqlite3 needs a local persistent filesystem. SQLite WAL and immediate transactions are efficient for a single self-hosted process, without Redis/Kafka/Kubernetes. Docker Compose named volume is P0.

Cloudflare Workers has Web APIs, not a general Node process/native better-sqlite3 filesystem. D1 is SQLite-compatible at SQL level but exposes async prepare/bind/all/run/batch APIs and different transaction/session semantics. Portability requires a Storage interface with transactional batches/conditional claims and idempotency atomicity, replacing synchronous transaction closures, testing foreign keys/JSON/index support, and official MCP Web Standard transport+Hono/fetch instead of Express. D1 constraints, global consistency and concurrency must be measured; WAL pragmas/local volume don't translate. Cloudflare Tunnel forwards HTTPS to the current persistent Node implementation and is the supported first step. D1 adapter is researched, not implemented/tested.

Vercel Functions local filesystem is ephemeral and cannot coordinate SQLite among replicas. A bundled SQLite file is not persistent storage. Viable future choices: external transactional Postgres/libSQL plus adapters, or persistent backend container/service and independently deployed static frontend. Neither is implemented. Static UI-only hosting would require explicit CORS and HTTPS API/auth setup; single-origin self-hosting minimizes security/configuration cost.

SSE and MCP POST should be tested through the selected reverse proxy; hub events are durable but long-lived connections aren't guaranteed by every hosting platform. No paid resource/tunnel/domain is created automatically.
