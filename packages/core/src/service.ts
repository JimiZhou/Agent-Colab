import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type Database from "better-sqlite3";
import type { EntityTable } from "./models.js";
import { openDatabase } from "./storage.js";
import {
  AppError,
  type Actor,
  type Role,
  type RecordData,
  projectSchema,
  projectUpdateSchema,
  joinSchema,
  taskSchema,
  findingSchema,
  reviewSchema,
  repositorySchema,
  pageSchema,
} from "./contracts.js";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const parse = (row: any): RecordData => JSON.parse(row.data);
export class Colab {
  db: Database.Database;
  constructor(
    file: string,
    private adminToken: string,
    public now: () => number = Date.now,
  ) {
    this.db = openDatabase(file);
  }
  close() {
    this.db.close();
  }
  get(table: EntityTable, id: string): RecordData {
    const row = this.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id);
    if (!row) throw new AppError(404, "NOT_FOUND", "Resource not found");
    return parse(row);
  }
  all(
    table: "tasks" | "findings" | "repository_links",
    projectId: string,
    limit = 30,
    after = 0,
  ): RecordData[] {
    return this.db
      .prepare(
        `SELECT data FROM ${table} WHERE project_id=? ORDER BY rowid LIMIT ? OFFSET ?`,
      )
      .all(projectId, limit, after)
      .map(parse);
  }
  update(table: EntityTable, item: RecordData) {
    this.db
      .prepare(`UPDATE ${table} SET data=? WHERE id=?`)
      .run(JSON.stringify(item), item.id);
    return item;
  }
  stamp() {
    return new Date(this.now()).toISOString();
  }
  event(projectId: string, actor: Actor, type: string, detail: unknown) {
    const id = randomUUID();
    this.db.prepare("INSERT INTO events(id,project_id,data) VALUES(?,?,?)").run(
      id,
      projectId,
      JSON.stringify({
        id,
        type,
        actor: actor.participantId,
        agentId: actor.agentId,
        detail,
        at: this.stamp(),
      }),
    );
  }
  authenticate(token?: string): Actor {
    if (!token)
      throw new AppError(401, "UNAUTHORIZED", "Bearer credential required");
    const a = Buffer.from(hash(token)),
      b = Buffer.from(hash(this.adminToken));
    if (timingSafeEqual(a, b))
      return { credentialId: "admin", participantId: "admin", admin: true };
    const row: any = this.db
      .prepare(
        "SELECT * FROM credentials WHERE hash=? AND revoked_at IS NULL AND expires_at>?",
      )
      .get(hash(token), this.now());
    if (!row)
      throw new AppError(
        401,
        "UNAUTHORIZED",
        "Credential invalid, expired or revoked",
      );
    const agent = this.get("agents", row.agent_id);
    this.update("agents", { ...agent, lastActive: this.stamp() });
    return {
      credentialId: row.id,
      participantId: agent.participantId,
      agentId: agent.id,
      projectId: row.project_id,
    };
  }
  authorize(actor: Actor | undefined, projectId: string, roles?: Role[]) {
    const p = this.get("projects", projectId);
    if (actor?.admin) return "owner" as Role;
    if (!actor) {
      if (!roles && p.public) return "reader" as Role;
      throw new AppError(
        401,
        "UNAUTHORIZED",
        "This project requires authentication",
      );
    }
    if (actor.projectId !== projectId)
      throw new AppError(
        403,
        "FORBIDDEN",
        "Credential belongs to another project",
      );
    const row: any = this.db
      .prepare(
        "SELECT role FROM memberships WHERE project_id=? AND participant_id=?",
      )
      .get(projectId, actor.participantId);
    if (!row || (roles && !roles.includes(row.role)))
      throw new AppError(403, "FORBIDDEN", "Insufficient project permission");
    return row.role as Role;
  }
  write(
    actor: Actor,
    key: string | undefined,
    operation: string,
    input: unknown,
    fn: () => unknown,
  ): any {
    if (!key || key.length > 200)
      throw new AppError(
        400,
        "IDEMPOTENCY_REQUIRED",
        "Supply a nonempty Idempotency-Key (max 200 characters)",
      );
    return this.db
      .transaction(() => {
        const requestHash = hash(JSON.stringify({ operation, input }));
        const prev: any = this.db
          .prepare("SELECT * FROM idempotency WHERE credential_id=? AND key=?")
          .get(actor.credentialId, key);
        if (prev) {
          if (prev.request_hash !== requestHash)
            throw new AppError(
              409,
              "IDEMPOTENCY_CONFLICT",
              "Key reused for a different request",
            );
          return this.decodeResponse(prev.response);
        }
        const result = fn();
        this.db
          .prepare("INSERT INTO idempotency VALUES(?,?,?,?)")
          .run(
            actor.credentialId,
            key,
            requestHash,
            this.encodeResponse(result),
          );
        return result;
      })
      .immediate();
  }
  // Encrypt cached responses because credential issuance returns a bearer secret once.
  encodeResponse(value: unknown) {
    const iv = randomBytes(12),
      cipher = createCipheriv(
        "aes-256-gcm",
        Buffer.from(hash(this.adminToken), "hex"),
        iv,
      );
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return JSON.stringify({
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    });
  }
  decodeResponse(value: string) {
    const v = JSON.parse(value),
      cipher = createDecipheriv(
        "aes-256-gcm",
        Buffer.from(hash(this.adminToken), "hex"),
        Buffer.from(v.iv, "base64"),
      );
    cipher.setAuthTag(Buffer.from(v.tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        cipher.update(Buffer.from(v.data, "base64")),
        cipher.final(),
      ]).toString("utf8"),
    );
  }
  createProject(actor: Actor, input: unknown) {
    if (!actor.admin)
      throw new AppError(
        403,
        "FORBIDDEN",
        "Instance administrator creates projects",
      );
    const b = projectSchema.parse(input),
      ownerId = randomUUID(),
      id = randomUUID();
    this.db.prepare("INSERT INTO participants VALUES(?,?)").run(
      ownerId,
      JSON.stringify({
        id: ownerId,
        name: "Project owner",
        createdAt: this.stamp(),
      }),
    );
    const p = { id, ...b, ownerId, createdAt: this.stamp() };
    this.db
      .prepare("INSERT INTO projects VALUES(?,?,?)")
      .run(id, ownerId, JSON.stringify(p));
    this.db
      .prepare("INSERT INTO memberships VALUES(?,?,?)")
      .run(id, ownerId, "owner");
    this.event(id, actor, "project.created", { id });
    return p;
  }
  join(actor: Actor, projectId: string, input: unknown) {
    this.authorize(actor, projectId, ["owner"]);
    const b = joinSchema.parse(input),
      p = this.get("projects", projectId);
    let participantId = b.participantId;
    if (!participantId && !b.participantName && b.role !== "owner")
      throw new AppError(
        400,
        "PARTICIPANT_REQUIRED",
        "Specify an existing participantId or an explicit new-human participantName; agent names do not create voter identities",
      );
    if (b.role === "owner" && !participantId && !b.participantName)
      participantId = p.ownerId;
    if (!participantId) {
      participantId = randomUUID();
      this.db.prepare("INSERT INTO participants VALUES(?,?)").run(
        participantId,
        JSON.stringify({
          id: participantId,
          name: b.participantName || b.name,
          createdAt: this.stamp(),
        }),
      );
    } else this.get("participants", participantId);
    const existing: any = this.db
      .prepare(
        "SELECT role FROM memberships WHERE project_id=? AND participant_id=?",
      )
      .get(projectId, participantId);
    if (b.participantId && !existing && !actor.admin)
      throw new AppError(
        403,
        "IDENTITY_LINK_FORBIDDEN",
        "Cross-project identity linking requires the instance administrator",
      );
    if (existing && existing.role !== b.role)
      throw new AppError(
        409,
        "ROLE_CONFLICT",
        "Use membership management to change an existing participant role",
      );
    this.db
      .prepare("INSERT OR IGNORE INTO memberships VALUES(?,?,?)")
      .run(projectId, participantId, b.role);
    let agent: RecordData;
    if (b.agentId) {
      agent = this.get("agents", b.agentId);
      if (agent.participantId !== participantId)
        throw new AppError(
          403,
          "FORBIDDEN",
          "Agent belongs to another participant",
        );
    } else {
      agent = {
        id: randomUUID(),
        participantId,
        name: b.name,
        harness: b.harness,
        model: b.model,
        createdAt: this.stamp(),
        lastActive: null,
      };
      this.db
        .prepare("INSERT INTO agents VALUES(?,?,?)")
        .run(agent.id, participantId, JSON.stringify(agent));
    }
    const token = randomBytes(32).toString("base64url"),
      credential = {
        id: randomUUID(),
        projectId,
        agentId: agent.id,
        expiresAt: this.now() + b.expiresIn * 1000,
        createdAt: this.stamp(),
      };
    this.db
      .prepare("INSERT INTO credentials VALUES(?,?,?,?,?,NULL,?)")
      .run(
        credential.id,
        hash(token),
        projectId,
        agent.id,
        credential.expiresAt,
        JSON.stringify(credential),
      );
    this.event(projectId, actor, "agent.joined", {
      agentId: agent.id,
      participantId,
      role: b.role,
    });
    return { agent, credential, token };
  }
  revoke(actor: Actor, projectId: string, id: string) {
    this.authorize(actor, projectId, ["owner"]);
    const row: any = this.db
      .prepare("SELECT id FROM credentials WHERE id=? AND project_id=?")
      .get(id, projectId);
    if (!row) throw new AppError(404, "NOT_FOUND", "Credential not found");
    this.db
      .prepare("UPDATE credentials SET revoked_at=? WHERE id=?")
      .run(this.now(), id);
    this.event(projectId, actor, "credential.revoked", { id });
    return { id, revoked: true };
  }
  membership(
    actor: Actor,
    projectId: string,
    participantId: string,
    role: Role,
  ) {
    this.authorize(actor, projectId, ["owner"]);
    if (participantId === this.get("projects", projectId).ownerId)
      throw new AppError(
        409,
        "OWNER_PROTECTED",
        "Cannot change founding owner",
      );
    const result = this.db
      .prepare(
        "UPDATE memberships SET role=? WHERE project_id=? AND participant_id=?",
      )
      .run(role, projectId, participantId);
    if (!result.changes)
      throw new AppError(404, "NOT_FOUND", "Membership not found");
    this.db
      .prepare(
        "DELETE FROM idempotency WHERE credential_id IN (SELECT c.id FROM credentials c JOIN agents a ON a.id=c.agent_id WHERE c.project_id=? AND a.participant_id=?)",
      )
      .run(projectId, participantId);
    this.event(projectId, actor, "membership.changed", { participantId, role });
    return { participantId, role };
  }
  patchProject(actor: Actor, projectId: string, input: unknown) {
    this.authorize(actor, projectId, ["owner"]);
    const b = projectUpdateSchema.parse(input);
    const p = this.update("projects", {
      ...this.get("projects", projectId),
      ...b,
    });
    this.event(projectId, actor, "project.updated", b);
    return p;
  }
  expire(projectId: string) {
    return this.db
      .transaction(() => {
        const rows: any[] = this.db
          .prepare(
            "SELECT l.task_id FROM leases l JOIN tasks t ON t.id=l.task_id WHERE t.project_id=? AND l.expires_at<=?",
          )
          .all(projectId, this.now());
        for (const r of rows) {
          const t = this.get("tasks", r.task_id);
          this.update("tasks", { ...t, status: "open", assignee: null });
          this.db.prepare("DELETE FROM leases WHERE task_id=?").run(t.id);
          this.event(
            projectId,
            { credentialId: "system", participantId: "system" },
            "task.expired",
            { taskId: t.id },
          );
        }
      })
      .immediate();
  }
  task(actor: Actor, projectId: string, input: unknown) {
    this.authorize(actor, projectId, ["owner", "reviewer", "contributor"]);
    const b = taskSchema.parse(input);
    for (const dep of b.dependencies) {
      const t = this.get("tasks", dep);
      if (t.projectId !== projectId)
        throw new AppError(
          403,
          "FORBIDDEN",
          "Dependency belongs to another project",
        );
    }
    const t = {
      id: randomUUID(),
      projectId,
      ...b,
      status: "open",
      assignee: null,
      createdBy: actor.participantId,
      createdAt: this.stamp(),
    };
    this.db
      .prepare("INSERT INTO tasks VALUES(?,?,?)")
      .run(t.id, projectId, JSON.stringify(t));
    this.event(projectId, actor, "task.created", { taskId: t.id });
    return t;
  }
  taskAction(
    actor: Actor,
    projectId: string,
    taskId: string,
    action: "claim" | "heartbeat" | "release" | "start",
  ) {
    this.authorize(actor, projectId, ["owner", "reviewer", "contributor"]);
    if (!actor.agentId)
      throw new AppError(400, "AGENT_REQUIRED", "Use an agent credential");
    this.expire(projectId);
    const t = this.get("tasks", taskId);
    if (t.projectId !== projectId)
      throw new AppError(403, "FORBIDDEN", "Task belongs to another project");
    const lease: any = this.db
      .prepare("SELECT * FROM leases WHERE task_id=?")
      .get(taskId);
    if (action === "claim") {
      if (t.status !== "open" || lease)
        throw new AppError(
          409,
          "TASK_CONFLICT",
          "Task already claimed or closed",
        );
      for (const dep of t.dependencies)
        if (this.get("tasks", dep).status !== "verified")
          throw new AppError(
            409,
            "DEPENDENCY_BLOCKED",
            "Dependencies must be verified",
          );
      const l = {
        taskId,
        agentId: actor.agentId,
        expiresAt: this.now() + 300000,
      };
      this.db
        .prepare("INSERT INTO leases VALUES(?,?,?,?)")
        .run(taskId, actor.agentId, l.expiresAt, JSON.stringify(l));
      this.update("tasks", {
        ...t,
        status: "claimed",
        assignee: actor.agentId,
      });
      this.event(projectId, actor, "task.claimed", l);
      return { ...this.get("tasks", taskId), lease: l };
    }
    if (!lease || lease.agent_id !== actor.agentId)
      throw new AppError(
        409,
        "LEASE_CONFLICT",
        "No active lease held by this agent",
      );
    if (action === "release") {
      this.db.prepare("DELETE FROM leases WHERE task_id=?").run(taskId);
      this.update("tasks", { ...t, status: "open", assignee: null });
    } else if (action === "start")
      this.update("tasks", { ...t, status: "in_progress" });
    else {
      const l = {
        taskId,
        agentId: actor.agentId,
        expiresAt: this.now() + 300000,
      };
      this.db
        .prepare("UPDATE leases SET expires_at=?,data=? WHERE task_id=?")
        .run(l.expiresAt, JSON.stringify(l), taskId);
    }
    this.event(projectId, actor, `task.${action}`, { taskId });
    return this.get("tasks", taskId);
  }
  finding(actor: Actor, projectId: string, input: unknown) {
    this.authorize(actor, projectId, ["owner", "reviewer", "contributor"]);
    const b = findingSchema.parse(input);
    this.expire(projectId);
    if (b.taskId) {
      const t = this.get("tasks", b.taskId);
      if (t.projectId !== projectId)
        throw new AppError(403, "FORBIDDEN", "Task belongs to another project");
      const l: any = this.db
        .prepare("SELECT * FROM leases WHERE task_id=?")
        .get(t.id);
      if (!l || l.agent_id !== actor.agentId)
        throw new AppError(
          409,
          "LEASE_REQUIRED",
          "Submission requires a current task lease",
        );
      this.update("tasks", { ...t, status: "submitted" });
      this.db.prepare("DELETE FROM leases WHERE task_id=?").run(t.id);
    }
    const findingId = randomUUID(),
      evidence = b.evidence.map((e) => ({ ...e, id: randomUUID(), findingId }));
    const f = {
      id: findingId,
      projectId,
      ...b,
      evidence,
      author: actor.admin
        ? this.get("projects", projectId).ownerId
        : actor.participantId,
      agentId: actor.agentId,
      status: "proposed",
      recognition: "pending",
      reproductionStatus: "unverified",
      createdAt: this.stamp(),
    };
    this.db
      .prepare("INSERT INTO findings VALUES(?,?,?,?)")
      .run(f.id, projectId, actor.participantId, JSON.stringify(f));
    for (const e of evidence)
      this.db
        .prepare("INSERT INTO evidence VALUES(?,?,?)")
        .run(e.id, f.id, JSON.stringify(e));
    this.event(projectId, actor, "finding.submitted", {
      findingId: f.id,
      taskId: b.taskId,
    });
    return f;
  }
  review(actor: Actor, projectId: string, input: unknown) {
    const role = this.authorize(actor, projectId, [
        "owner",
        "reviewer",
        "contributor",
      ]),
      b = reviewSchema.parse(input),
      f = this.get("findings", b.findingId);
    if (f.projectId !== projectId)
      throw new AppError(
        403,
        "FORBIDDEN",
        "Finding belongs to another project",
      );
    const participantId = actor.admin
      ? this.get("projects", projectId).ownerId
      : actor.participantId;
    if (f.status === "rejected")
      throw new AppError(
        409,
        "FINDING_CLOSED",
        "Rejected findings are closed; submit a new finding",
      );
    if (f.author === participantId)
      throw new AppError(
        403,
        "SELF_REVIEW",
        "A participant cannot review their own agents",
      );
    const p = this.get("projects", projectId);
    if (b.vote === "revoke" && role !== "owner" && role !== "reviewer")
      throw new AppError(
        403,
        "FORBIDDEN",
        "Revocation requires owner or reviewer",
      );
    const existing: any = this.db
      .prepare("SELECT * FROM reviews WHERE finding_id=? AND participant_id=?")
      .get(f.id, participantId);
    if (existing && b.vote !== "revoke")
      throw new AppError(
        409,
        "DUPLICATE_REVIEW",
        "Participant already reviewed, including through another agent",
      );
    const r = {
      id: existing?.id || randomUUID(),
      projectId,
      ...b,
      participantId,
      agentId: actor.agentId,
      role,
      createdAt: this.stamp(),
    };
    if (existing) this.update("reviews", r);
    else
      this.db
        .prepare("INSERT INTO reviews VALUES(?,?,?,?)")
        .run(r.id, f.id, participantId, JSON.stringify(r));
    const votes = this.db
      .prepare("SELECT data FROM reviews WHERE finding_id=?")
      .all(f.id)
      .map(parse);
    const disagree = votes.some((x) => x.vote !== "approve");
    const independent = votes.filter(
      (x) => x.vote === "approve" && x.participantId !== "admin",
    );
    // Governance recognition is distinct from unverified claims of technical reproduction.
    const recognized =
      p.mode === "owner"
        ? votes.some(
            (x) =>
              x.vote === "approve" && ["owner", "reviewer"].includes(x.role),
          )
        : independent.length >= p.threshold;
    const status = disagree ? "disputed" : recognized ? "verified" : "proposed";
    const updated = this.update("findings", {
      ...f,
      status,
      recognition: disagree ? "disputed" : recognized ? "accepted" : "pending",
      reproductionStatus:
        independent.filter((x) => x.reproduced).length >= 2
          ? "independently_reported"
          : "unverified",
    });
    if (f.taskId) {
      const t = this.get("tasks", f.taskId);
      this.update("tasks", {
        ...t,
        status: status === "proposed" ? "submitted" : status,
      });
    }
    this.event(projectId, actor, "finding.reviewed", {
      findingId: f.id,
      reviewId: r.id,
      status,
    });
    return { review: r, finding: updated };
  }
  rejectFinding(actor: Actor, projectId: string, id: string, reason: string) {
    this.authorize(actor, projectId, ["owner", "reviewer"]);
    const f = this.get("findings", id);
    if (f.projectId !== projectId)
      throw new AppError(
        403,
        "FORBIDDEN",
        "Finding belongs to another project",
      );
    const updated = this.update("findings", {
      ...f,
      status: "rejected",
      recognition: "rejected",
      rejectionReason: reason,
    });
    if (f.taskId)
      this.update("tasks", {
        ...this.get("tasks", f.taskId),
        status: "rejected",
      });
    this.event(projectId, actor, "finding.rejected", { findingId: id, reason });
    return updated;
  }
  repository(actor: Actor, projectId: string, input: unknown) {
    this.authorize(actor, projectId, ["owner"]);
    const b = repositorySchema.parse(input);
    if (b.pr && !b.pr.startsWith(b.url.replace(/\/$/, "") + "/pull/"))
      throw new AppError(
        400,
        "INVALID_LINK",
        "PR must belong to linked repository",
      );
    const link = { id: randomUUID(), projectId, ...b, createdAt: this.stamp() };
    this.db
      .prepare("INSERT INTO repository_links VALUES(?,?,?)")
      .run(link.id, projectId, JSON.stringify(link));
    this.event(projectId, actor, "repository.linked", { id: link.id });
    return link;
  }
  findingSummary(f: RecordData) {
    return {
      id: f.id,
      projectId: f.projectId,
      title: f.title,
      summary: String(f.summary || "").slice(0, 1000),
      direction: f.direction,
      author: f.author,
      agentId: f.agentId,
      taskId: f.taskId,
      status: f.status,
      recognition: f.recognition,
      reproductionStatus: f.reproductionStatus,
      evidenceCount: f.evidence?.length || 0,
      createdAt: f.createdAt,
    };
  }
  listProjects(actor?: Actor) {
    return this.db
      .prepare("SELECT data FROM projects ORDER BY rowid LIMIT 100")
      .all()
      .map(parse)
      .filter((p) => p.public || actor?.admin || actor?.projectId === p.id);
  }
  events(
    actor: Actor | undefined,
    projectId: string,
    input: unknown,
  ): (RecordData & { sequence: number })[] {
    this.authorize(actor, projectId);
    const { limit, after } = pageSchema.parse(input);
    return this.db
      .prepare(
        "SELECT sequence,data FROM events WHERE project_id=? AND sequence>? ORDER BY sequence LIMIT ?",
      )
      .all(projectId, after, limit)
      .map((r: any) => ({ ...parse(r), sequence: r.sequence }));
  }
  list(
    actor: Actor | undefined,
    projectId: string,
    table: "tasks" | "findings" | "repository_links",
    input: unknown,
  ) {
    this.authorize(actor, projectId);
    this.expire(projectId);
    const { limit, after } = pageSchema.parse(input);
    const items = this.all(table, projectId, limit, after);
    return table === "findings"
      ? items.map((f) => this.findingSummary(f))
      : items;
  }
  getFinding(actor: Actor | undefined, projectId: string, id: string) {
    this.authorize(actor, projectId);
    const f = this.get("findings", id);
    if (f.projectId !== projectId)
      throw new AppError(
        403,
        "FORBIDDEN",
        "Finding belongs to another project",
      );
    return {
      ...f,
      reviews: this.db
        .prepare("SELECT data FROM reviews WHERE finding_id=? LIMIT 100")
        .all(id)
        .map(parse),
    };
  }
  agents(actor: Actor | undefined, projectId: string) {
    this.authorize(actor, projectId);
    this.expire(projectId);
    return this.db
      .prepare(
        "SELECT a.data,m.role,p.data participant FROM agents a JOIN participants p ON p.id=a.participant_id JOIN memberships m ON m.participant_id=a.participant_id WHERE m.project_id=? AND (EXISTS (SELECT 1 FROM credentials cr WHERE cr.agent_id=a.id AND cr.project_id=m.project_id) OR json_extract(a.data,'$.legacyProjectId')=m.project_id) LIMIT 100",
      )
      .all(projectId)
      .map((r: any) => {
        const a = parse(r);
        const leases = this.db
          .prepare(
            "SELECT l.data,t.data task FROM leases l JOIN tasks t ON t.id=l.task_id WHERE l.agent_id=? AND t.project_id=? ORDER BY l.expires_at LIMIT 10",
          )
          .all(a.id, projectId)
          .map((x: any) => ({
            ...JSON.parse(x.data),
            task: ((t: RecordData) => ({
              id: t.id,
              title: t.title,
              status: t.status,
            }))(JSON.parse(x.task)),
          }));
        return {
          ...a,
          participant: JSON.parse(r.participant),
          role: r.role,
          leases,
          leaseCount: (
            this.db
              .prepare(
                "SELECT count(*) n FROM leases l JOIN tasks t ON t.id=l.task_id WHERE l.agent_id=? AND t.project_id=?",
              )
              .get(a.id, projectId) as any
          ).n,
          leaseDetailsLimit: 10,
          activity:
            a.lastActive && this.now() - Date.parse(a.lastActive) < 300000
              ? "recently_active"
              : "offline_or_timeout",
          submissions: (
            this.db
              .prepare(
                "SELECT count(*) n FROM findings WHERE project_id=? AND json_extract(data,'$.agentId')=?",
              )
              .get(projectId, a.id) as any
          ).n,
          reviews: (
            this.db
              .prepare(
                "SELECT count(*) n FROM reviews WHERE json_extract(data,'$.projectId')=? AND json_extract(data,'$.agentId')=?",
              )
              .get(projectId, a.id) as any
          ).n,
        };
      });
  }
  context(actor: Actor | undefined, projectId: string): RecordData {
    this.authorize(actor, projectId);
    this.expire(projectId);
    return {
      ...this.get("projects", projectId),
      ownerName: this.get(
        "participants",
        this.get("projects", projectId).ownerId,
      ).name,
      stats: {
        ...(this.db
          .prepare(
            `SELECT count(DISTINCT a.participant_id) participants, count(*) agents FROM agents a JOIN memberships m ON m.participant_id=a.participant_id WHERE m.project_id=? AND (EXISTS (SELECT 1 FROM credentials cr WHERE cr.agent_id=a.id AND cr.project_id=m.project_id) OR json_extract(a.data,'$.legacyProjectId')=m.project_id)`,
          )
          .get(projectId) as object),
        ...(this.db
          .prepare(
            `SELECT count(*) tasks,
          count(CASE WHEN json_extract(data,'$.status')='open' THEN 1 END) openTasks,
          count(CASE WHEN json_extract(data,'$.status') IN ('claimed','in_progress') THEN 1 END) workingTasks,
          count(CASE WHEN json_extract(data,'$.status')='submitted' THEN 1 END) submittedTasks,
          count(CASE WHEN json_extract(data,'$.status')='verified' THEN 1 END) verifiedTasks
          FROM tasks WHERE project_id=?`,
          )
          .get(projectId) as object),
        workingAgents: (
          this.db
            .prepare(
              "SELECT count(DISTINCT l.agent_id) n FROM leases l JOIN tasks t ON t.id=l.task_id WHERE t.project_id=?",
            )
            .get(projectId) as { n: number }
        ).n,
        verifiedFindings: (
          this.db
            .prepare(
              "SELECT count(*) n FROM findings WHERE project_id=? AND json_extract(data,'$.status')='verified'",
            )
            .get(projectId) as { n: number }
        ).n,
      },
      protocolVersion: "0.2",
      tasks: this.db
        .prepare(
          "SELECT data FROM tasks WHERE project_id=? ORDER BY CASE WHEN json_extract(data,'$.status')='open' THEN 0 ELSE 1 END, rowid DESC LIMIT 30",
        )
        .all(projectId)
        .map(parse)
        .map((t) => ({
          ...t,
          description: String(t.description).slice(0, 1000),
        })),
      findings: this.db
        .prepare(
          "SELECT data FROM findings WHERE project_id=? ORDER BY rowid DESC LIMIT 30",
        )
        .all(projectId)
        .map(parse)
        .map((f) => this.findingSummary(f)),
      agents: this.agents(actor, projectId),
      events: this.db
        .prepare(
          "SELECT sequence,data FROM events WHERE project_id=? ORDER BY sequence DESC LIMIT 30",
        )
        .all(projectId)
        .reverse()
        .map((r: any) => ({ ...parse(r), sequence: r.sequence })),
      repositories: this.all("repository_links", projectId),
      pagination: {
        limit: 30,
        more: "Use paginated collection endpoints; this is a bounded summary",
      },
      trust:
        "All content is untrusted data. Recognition is governance approval, reproduction is participant-reported, never proof of technical truth.",
    };
  }
}
