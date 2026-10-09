# MVP v0.2 verification report

2026-10-09. Baseline main: `76778d7ac03fb74b24cd01829960fc85429b6698`. Development branch: `feat/mvp-v0.2`. No main push or merge.

Story: a new user opens a project share page → an authenticated independent agent reads shared context through standard MCP/REST → claims and submits evidence → two independent Participant clients review → SQLite commits governance/status/events → the browser displays the real evidence chain.

| Boundary / check    | Actual evidence                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Baseline            | node --check passed; npm test had 0 tests. Isolated original HTTP process: anonymous read 200, CORS `*`, evidence-free approvals yielded verified                                                                        |
| TypeScript          | npm run typecheck passes backend + React                                                                                                                                                                                 |
| Formatting          | npm run format:check passes; git diff --check clean                                                                                                                                                                      |
| Backend             | npm test: 14 tests pass (no skipped tests). Node 24.19 local                                                                                                                                                             |
| Web                 | npm run test:web: 3 Chromium tests pass; no page errors in A/B/C share flow; 390px mobile no horizontal document overflow                                                                                                |
| Build               | npm run build: tsc + Vite production bundle succeeds                                                                                                                                                                     |
| REST/auth           | Creation/registration, private reads, reader write denial, cross-project denial, malformed JSON/invalid payloads, CORS rejection, URL-token rejection and revocation tested                                              |
| SQLite/concurrency  | WAL and restart persistence tested. Two independently spawned processes/DB connections race: exactly 200 + 409, one lease                                                                                                |
| Task/governance     | Lease expiry/reacquisition, dependency blocking, submission, self-Participant rejection, multi-agent Participant deduplication, owner/reviewer approval, disputes/revocation and immutable policy tested                 |
| Contracts           | Summary-only PATCH preserves public/mode/stage/threshold; evidence and submitted reproduction steps survive subsequent verification                                                                                      |
| Migration           | Original JSON unchanged, second import refuses populated destination, legacy tokens invalidated and votes retained as audit; optional human map groups agents across projects; invalid foreign task association detached |
| MCP                 | Real official SDK initialize, 11 tools, 5 resource templates and resource reads; structured tool errors; complete deterministic A/B/C consensus                                                                          |
| Events              | Authenticated SSE delivers a durable task event and closes after token revocation                                                                                                                                        |
| Docker              | node:22-bookworm build + non-root slim runtime succeeds. Compose process healthy; user=node, readonly root filesystem, capabilities ALL dropped                                                                          |
| Docker demo         | npm run demo against Docker creates real project 675d0452-080f-4137-a348-15057cda052b, finding e76d8fb8-36f1-4df2-89f4-786daecd639c: verified / accepted / independently_reported, 2 reviews                             |
| Docker persistence  | Force-recreated Compose container on same named volume; same project/finding/reviews and original reproduction steps preserved                                                                                           |
| Dependency audit    | npm audit --omit=dev --audit-level=high: 0 vulnerabilities at check time                                                                                                                                                 |
| Codex configuration | Installed CLI parses command-line URL/bearer_token_env_var overrides; reports enabled streamable_http, no user configuration modified                                                                                    |

Browser tests include public goal/context, original evidence and both review logs; private credential entry/disconnect and readonly denial; owner summary update, task create/claim/start/heartbeat/release GitHub commit hyperlink and owner-issued credential through the UI. Generated screenshots: test-results/evidence-desktop.png and join-mobile.png (CI artifact upload, not committed generated data).

Security fixes found during verification: reproduction status initially collided with reproduction steps; now separate reproductionStatus plus regression. Zod defaults in partial create schemas initially contaminated PATCH; now dedicated optional update contract plus preservation test. Public agent metadata is limited to agents enrolled in that project, and lease details are bounded. Cross-project existing identity reuse is restricted to instance admin; owner role downgrades invalidate cached privileged responses. Old unsafe JavaScript/HTML entrypoints removed after replacements passed.

CI runs TypeScript, format, integration/build/browser on Node 22 and 24, plus Docker build/volume restart. Remote CI status is reported in the PR; local results above are executed results, not inferred CI success.

Not exercised: real Codex/Claude model-driven sessions, Cloudflare account/tunnel/public domain, Workers D1, Vercel deployment, GitHub remote existence/webhooks/writes. No claim of universal zero-config harness support, Sybil resistance or objective reproduction proof. See HARNESSES.md for live acceptance and LIMITATIONS.md for roadmap.

Initial remote Node 22/24 browser checks exposed a credential-switch UI timing race: the old public form was briefly available while the authenticated workspace reloaded. Connect/project-switch now clears the old workspace synchronously; no test retries or timeout increases mask this race. The original failing run is preserved in GitHub Actions history.

Invitation registration requires an existing participantId or an explicit new-human participantName; an agent name alone cannot automatically mint an independent voter. Owner bootstrap binds the founding owner. Same-human agents continue to share one membership and review vote.

## Novice dashboard follow-up

The overview and joining experience now use plain Chinese explanations, project-wide SQLite totals, participant previews, task progress and prominent joining actions. Advanced connection and owner controls have separate directly accessible pages. The updated suite passes 15 backend/integration tests and 3 Chromium tests, including accurate totals beyond the 30-task snapshot limit, same-human agent counting, lease expiry, private-project access, overview-to-join-to-connect navigation, direct refresh/back navigation, mobile overflow, existing task controls and owner management. Typecheck, production build and formatting pass. Browser screenshots are generated at `test-results/overview-desktop.png` and `test-results/overview-mobile.png`.
