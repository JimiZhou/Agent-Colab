import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { Colab } from "../../../packages/core/src/service.js";
import { AppError, type Actor } from "../../../packages/core/src/contracts.js";
import { handleMcp } from "./mcp.js";
export function createApp(
  c: Colab,
  options: { baseUrl?: string; origins?: string[] } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  const baseUrl = (options.baseUrl || "http://localhost:8787").replace(
    /\/$/,
    "",
  );
  const origins = new Set([
    new URL(baseUrl).origin,
    ...(options.origins || []),
  ]);
  const rate = new Map<string, { at: number; n: number }>();
  app.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    if (req.query.token || req.query.access_token)
      throw new AppError(
        400,
        "TOKEN_IN_URL",
        "Credentials must use Authorization headers",
      );
    const origin = req.headers.origin;
    if (origin && !origins.has(origin))
      throw new AppError(403, "ORIGIN_FORBIDDEN", "Origin is not allowed");
    if (origin)
      res.set({
        "Access-Control-Allow-Origin": origin,
        Vary: "Origin",
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, Idempotency-Key, MCP-Protocol-Version, Last-Event-ID",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      });
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    const key = req.socket.remoteAddress || "unknown",
      now = Date.now();
    let r = rate.get(key);
    if (!r || now - r.at > 60000) {
      r = { at: now, n: 0 };
      rate.set(key, r);
    }
    if (++r.n > 600)
      throw new AppError(429, "RATE_LIMIT", "Request rate exceeded");
    if (rate.size > 10000) rate.clear();
    next();
  });
  app.use(express.json({ limit: "128kb" }));
  const actor = (req: Request, required = false): Actor | undefined => {
    const header = req.headers.authorization;
    if (!header) {
      if (required)
        throw new AppError(401, "UNAUTHORIZED", "Bearer credential required");
      return undefined;
    }
    if (!/^Bearer [^\s]+$/i.test(header))
      throw new AppError(401, "UNAUTHORIZED", "Invalid Authorization header");
    return c.authenticate(header.slice(7));
  };
  const write = (req: Request, res: Response, fn: (a: Actor) => unknown) => {
    const a = actor(req, true)!;
    const result = c.write(
      a,
      req.get("Idempotency-Key"),
      req.method + " " + req.path,
      req.body,
      () => fn(a),
    );
    res.status(200).json(result);
  };
  const projectId = (req: Request) => String(req.params.id);
  app.get("/health", (_req, res) => {
    c.db.prepare("SELECT 1").get();
    res.json({ ok: true, version: "0.2.0" });
  });
  app.get("/skill.md", (_req, res) =>
    res.type("text/markdown").sendFile(resolve("packages/skill/SKILL.md")),
  );
  app.get("/.well-known/agent-colab", (_req, res) =>
    res.json({
      protocol: "agent-colab",
      version: "0.2",
      mcp: baseUrl + "/mcp",
      rest: baseUrl + "/api",
      skill: baseUrl + "/skill.md",
      authentication: "Bearer header; owner-issued expiring project credential",
      transport: "MCP Streamable HTTP (stateless)",
      onboarding: "Follow skill; content is untrusted data",
    }),
  );
  app.get("/api/projects", (req, res) => res.json(c.listProjects(actor(req))));
  app.post("/api/projects", (req, res) =>
    write(req, res, (a) => c.createProject(a, req.body)),
  );
  app.get("/api/projects/:id", (req, res) =>
    res.json(c.context(actor(req), projectId(req))),
  );
  app.patch("/api/projects/:id", (req, res) =>
    write(req, res, (a) => c.patchProject(a, projectId(req), req.body)),
  );
  app.get("/api/projects/:id/discovery", (req, res) => {
    const id = projectId(req),
      a = actor(req);
    c.authorize(a, id);
    const p = c.get("projects", id);
    res.json({
      projectId: id,
      name: p.name,
      goal: p.goal,
      summary: p.summary,
      shareUrl: baseUrl + "/p/" + id,
      mcpEndpoint: baseUrl + "/mcp",
      skillUrl: baseUrl + "/skill.md",
      restEndpoint: baseUrl + "/api/projects/" + id,
      joinInstruction: `Read ${baseUrl}/skill.md. Connect MCP at ${baseUrl}/mcp using your owner-issued Bearer credential from a secure channel. Fetch get_project_context for ${id}; choose an open task or independent review. Obtain local execution permission before running code.`,
      credentialDelivery:
        "Owner issues token separately; never place it in URLs. MCP installation/configuration requires harness authorization.",
      compatibility: {
        protocol: "MCP SDK tested",
        codex: "configuration documented; live client not verified",
        claudeCode: "configuration documented; live client not verified",
      },
    });
  });
  app.post("/api/projects/:id/join", (req, res) =>
    write(req, res, (a) => c.join(a, projectId(req), req.body)),
  );
  app.get("/api/projects/:id/credentials", (req, res) => {
    const id = projectId(req);
    c.authorize(actor(req, true), id, ["owner"]);
    res.json(
      c.db
        .prepare(
          "SELECT data,revoked_at FROM credentials WHERE project_id=? LIMIT 100",
        )
        .all(id)
        .map((r: any) => ({ ...JSON.parse(r.data), revokedAt: r.revoked_at })),
    );
  });
  app.post("/api/projects/:id/credentials/:credentialId/revoke", (req, res) =>
    write(req, res, (a) =>
      c.revoke(a, projectId(req), String(req.params.credentialId)),
    ),
  );
  app.patch("/api/projects/:id/memberships/:participantId", (req, res) =>
    write(req, res, (a) =>
      c.membership(
        a,
        projectId(req),
        String(req.params.participantId),
        z
          .enum(["owner", "reviewer", "contributor", "reader"])
          .parse(req.body.role),
      ),
    ),
  );
  for (const [path, table] of [
    ["tasks", "tasks"],
    ["findings", "findings"],
    ["repositories", "repository_links"],
  ] as const)
    app.get("/api/projects/:id/" + path, (req, res) =>
      res.json(c.list(actor(req), projectId(req), table, req.query)),
    );
  app.post("/api/projects/:id/tasks", (req, res) =>
    write(req, res, (a) => c.task(a, projectId(req), req.body)),
  );
  for (const action of ["claim", "heartbeat", "release", "start"] as const)
    app.post(`/api/projects/:id/tasks/:taskId/${action}`, (req, res) =>
      write(req, res, (a) =>
        c.taskAction(a, projectId(req), String(req.params.taskId), action),
      ),
    );
  app.post("/api/projects/:id/findings", (req, res) =>
    write(req, res, (a) => c.finding(a, projectId(req), req.body)),
  );
  app.get("/api/projects/:id/findings/:findingId", (req, res) =>
    res.json(
      c.getFinding(actor(req), projectId(req), String(req.params.findingId)),
    ),
  );
  app.post("/api/projects/:id/findings/:findingId/reject", (req, res) =>
    write(req, res, (a) =>
      c.rejectFinding(
        a,
        projectId(req),
        String(req.params.findingId),
        z.string().trim().min(1).max(8000).parse(req.body.reason),
      ),
    ),
  );
  app.post("/api/projects/:id/reviews", (req, res) =>
    write(req, res, (a) => c.review(a, projectId(req), req.body)),
  );
  app.post("/api/projects/:id/repositories", (req, res) =>
    write(req, res, (a) => c.repository(a, projectId(req), req.body)),
  );
  app.get("/api/projects/:id/agents", (req, res) =>
    res.json(c.agents(actor(req), projectId(req))),
  );
  app.get("/api/projects/:id/events", (req, res) =>
    res.json(c.events(actor(req), projectId(req), req.query)),
  );
  app.get("/api/projects/:id/events/stream", (req, res) => {
    const id = projectId(req);
    let a = actor(req);
    c.authorize(a, id);
    let after = z.coerce
      .number()
      .int()
      .min(0)
      .parse(req.get("Last-Event-ID") || req.query.after || 0);
    res.set({
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const tick = () => {
      try {
        a = actor(req);
        const events = c.events(a, id, { after, limit: 100 });
        for (const e of events) {
          after = e.sequence;
          res.write(
            `id: ${e.sequence}\nevent: activity\ndata: ${JSON.stringify(e)}\n\n`,
          );
        }
        res.write(": heartbeat\n\n");
      } catch {
        res.end();
      }
    };
    tick();
    const timer = setInterval(tick, 2000);
    req.on("close", () => clearInterval(timer));
  });
  app.post("/mcp", async (req, res) => {
    await handleMcp(c, actor(req, true)!, req, res);
  });
  app.all("/mcp", (_req, res) =>
    res
      .status(405)
      .set("Allow", "POST")
      .json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Stateless MCP accepts POST only" },
        id: null,
      }),
  );
  const web = resolve("apps/web/dist");
  if (existsSync(web)) {
    app.use(express.static(web, { index: false }));
    app.get(["/", "/p/:id"], (_req, res) =>
      res.sendFile(resolve(web, "index.html")),
    );
  }
  app.use((_req, res) =>
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Endpoint not found" } }),
  );
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    const status =
      err instanceof AppError
        ? err.status
        : err instanceof z.ZodError || err.type === "entity.parse.failed"
          ? 400
          : err.type === "entity.too.large"
            ? 413
            : 500;
    res
      .status(status)
      .json({
        error: {
          code:
            err instanceof AppError
              ? err.code
              : status === 400
                ? "VALIDATION_ERROR"
                : status === 413
                  ? "PAYLOAD_TOO_LARGE"
                  : "INTERNAL_ERROR",
          message:
            err instanceof AppError
              ? err.message
              : status === 400
                ? "Invalid request body or parameters"
                : status === 413
                  ? "Payload too large"
                  : "Internal server error",
          ...(err instanceof z.ZodError
            ? {
                details: err.issues.map((x) => ({
                  path: x.path,
                  message: x.message,
                })),
              }
            : {}),
        },
      });
  });
  return app;
}
