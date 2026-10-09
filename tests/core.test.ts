import { test } from "node:test";
import assert from "node:assert/strict";
import { Colab } from "../packages/core/src/service.js";
const admin = { credentialId: "admin", participantId: "admin", admin: true };
test("SQLite project, identities, permissions, idempotency and credential revocation", () => {
  const c = new Colab(":memory:", "secret");
  const p = c.write(admin, "p", "create", {}, () =>
    c.createProject(admin, { name: "Lab", goal: "Research" }),
  );
  assert.equal(p.public, false);
  const invite = c.write(admin, "join", "join", {}, () =>
    c.join(admin, p.id, { name: "A", participantName: "A human" }),
  );
  const a = c.authenticate(invite.token);
  assert.equal(a.participantId, invite.agent.participantId);
  assert.throws(() => c.context(undefined, p.id));
  assert.equal(c.context(a, p.id).name, "Lab");
  assert.deepEqual(
    c.write(admin, "p", "create", {}, () => {
      throw Error("should not run");
    }),
    p,
  );
  assert.throws(() => c.write(admin, "p", "other", {}, () => null));
  c.write(admin, "revoke", "revoke", {}, () =>
    c.revoke(admin, p.id, invite.credential.id),
  );
  assert.throws(() => c.authenticate(invite.token));
  c.close();
});
test("lease conflict, expiry, submission and participant-aware community recognition", () => {
  let time = 100000;
  const c = new Colab(":memory:", "secret", () => time);
  const p = c.write(admin, "p", "p", {}, () =>
    c.createProject(admin, {
      name: "Lab",
      goal: "Reproduce",
      mode: "community",
    }),
  );
  const join = (key: string, b: any) =>
    c.write(admin, key, "join", b, () =>
      c.join(admin, p.id, {
        ...b,
        ...(!b.participantId && b.role !== "owner"
          ? { participantName: b.name }
          : {}),
      }),
    );
  const A = join("a", { name: "A" }),
    B = join("b", { name: "B" }),
    C = join("c", { name: "C" }),
    B2 = join("b2", { name: "B2", participantId: B.agent.participantId });
  const a = c.authenticate(A.token),
    b = c.authenticate(B.token),
    cc = c.authenticate(C.token),
    b2 = c.authenticate(B2.token);
  const t = c.write(a, "t", "task", {}, () =>
    c.task(a, p.id, { title: "Task" }),
  );
  c.write(a, "claim", "claim", {}, () => c.taskAction(a, p.id, t.id, "claim"));
  assert.throws(() =>
    c.write(b, "claim", "claim", {}, () =>
      c.taskAction(b, p.id, t.id, "claim"),
    ),
  );
  time += 300001;
  c.expire(p.id);
  assert.equal(c.get("tasks", t.id).status, "open");
  c.write(a, "claim2", "claim", {}, () => c.taskAction(a, p.id, t.id, "claim"));
  const f = c.write(a, "f", "finding", {}, () =>
    c.finding(a, p.id, {
      title: "Finding",
      summary: "Result",
      direction: "test",
      method: "experiment",
      taskId: t.id,
      evidence: [{ description: "Run log" }],
      reproduction: "Run tests",
    }),
  );
  const r = {
    findingId: f.id,
    vote: "approve",
    environment: "Node22",
    evidence: "Independent run log",
    reproduced: true,
  };
  assert.throws(() =>
    c.write(a, "self", "review", r, () => c.review(a, p.id, r)),
  );
  c.write(b, "r", "review", r, () => c.review(b, p.id, r));
  assert.throws(() =>
    c.write(b2, "r", "review", r, () => c.review(b2, p.id, r)),
  );
  c.write(cc, "r", "review", r, () => c.review(cc, p.id, r));
  assert.equal(c.get("findings", f.id).status, "verified");
  assert.equal(
    c.get("findings", f.id).reproductionStatus,
    "independently_reported",
  );
  assert.equal(c.get("findings", f.id).reproduction, "Run tests");
  assert.equal(c.get("tasks", t.id).status, "verified");
  c.close();
});
test("owner-led authorization, dispute/revocation, role changes, expiry and dependencies", () => {
  let time = 1;
  const c = new Colab(":memory:", "secret", () => time);
  const p = c.write(admin, "p", "p", {}, () =>
    c.createProject(admin, { name: "Owner", goal: "Research" }),
  );
  const reg = (key: string, b: any) =>
    c.write(admin, key, "join", b, () =>
      c.join(admin, p.id, {
        ...b,
        ...(!b.participantId && b.role !== "owner"
          ? { participantName: b.name }
          : {}),
      }),
    );
  const A = reg("a", { name: "A" }),
    B = reg("b", { name: "B" }),
    R = reg("r", { name: "Reviewer", role: "reviewer", expiresIn: 60 });
  const a = c.authenticate(A.token),
    b = c.authenticate(B.token),
    r = c.authenticate(R.token);
  const f = c.write(a, "f", "f", {}, () =>
    c.finding(a, p.id, {
      title: "Claim",
      summary: "Test",
      direction: "Test",
      method: "Test run",
      evidence: [{ description: "Log" }],
      reproduction: "Run",
    }),
  );
  const review = {
    findingId: f.id,
    vote: "approve",
    environment: "Node",
    evidence: "Log",
  };
  c.write(b, "vote", "review", review, () => c.review(b, p.id, review));
  assert.equal(c.get("findings", f.id).status, "proposed");
  c.write(r, "vote", "review", review, () => c.review(r, p.id, review));
  assert.equal(c.get("findings", f.id).status, "verified");
  assert.equal(c.get("findings", f.id).reproductionStatus, "unverified");
  c.write(r, "revoke", "review", {}, () =>
    c.review(r, p.id, {
      ...review,
      vote: "revoke",
      failureReason: "Unable to reproduce on second environment",
    }),
  );
  assert.equal(c.get("findings", f.id).status, "disputed");
  const t = c.write(a, "t", "task", {}, () =>
    c.task(a, p.id, { title: "Dependency" }),
  );
  const dep = c.write(a, "d", "task", {}, () =>
    c.task(a, p.id, { title: "Blocked", dependencies: [t.id] }),
  );
  assert.throws(() =>
    c.write(a, "claim", "claim", {}, () =>
      c.taskAction(a, p.id, dep.id, "claim"),
    ),
  );
  c.write(admin, "downgrade", "member", {}, () =>
    c.membership(admin, p.id, a.participantId, "reader"),
  );
  assert.throws(() =>
    c.write(a, "f", "f", {}, () => c.finding(a, p.id, { title: "Replay" })),
  );
  time += 60001;
  assert.throws(() => c.authenticate(R.token));
  c.close();
});
test("owners cannot link another project identity; administrator can reuse agents across projects", () => {
  const c = new Colab(":memory:", "secret");
  const p = c.write(admin, "p", "p", {}, () =>
      c.createProject(admin, { name: "A", goal: "A" }),
    ),
    q = c.write(admin, "q", "q", {}, () =>
      c.createProject(admin, { name: "B", goal: "B" }),
    );
  const a = c.write(admin, "a", "a", {}, () =>
    c.join(admin, p.id, { name: "Agent A", participantName: "Agent A human" }),
  );
  const o = c.write(admin, "o", "o", {}, () =>
    c.join(admin, q.id, { name: "Owner B", role: "owner" }),
  );
  const owner = c.authenticate(o.token);
  const payload = {
    name: "Linked A",
    participantId: a.agent.participantId,
    agentId: a.agent.id,
  };
  assert.throws(() =>
    c.write(owner, "link", "link", payload, () => c.join(owner, q.id, payload)),
  );
  const linked = c.write(admin, "link", "link", payload, () =>
    c.join(admin, q.id, payload),
  );
  assert.equal(linked.agent.id, a.agent.id);
  assert.equal(c.context(c.authenticate(linked.token), q.id).id, q.id);
  assert.throws(() => c.context(c.authenticate(linked.token), p.id));
  c.close();
});
test("partial context updates preserve public sharing, stage and immutable governance", () => {
  const c = new Colab(":memory:", "secret");
  const p = c.write(admin, "p", "p", {}, () =>
    c.createProject(admin, {
      name: "Lab",
      goal: "Goal",
      public: true,
      stage: "Validation",
      mode: "community",
      threshold: 3,
    }),
  );
  const updated = c.write(admin, "update", "update", {}, () =>
    c.patchProject(admin, p.id, { summary: "New summary" }),
  );
  assert.equal(updated.summary, "New summary");
  assert.equal(updated.public, true);
  assert.equal(updated.stage, "Validation");
  assert.equal(updated.mode, "community");
  assert.equal(updated.threshold, 3);
  assert.throws(() =>
    c.write(admin, "policy", "update", {}, () =>
      c.patchProject(admin, p.id, { mode: "owner" }),
    ),
  );
  c.close();
});
test("agent metadata stays project-local and active lease summaries are bounded", () => {
  const c = new Colab(":memory:", "secret");
  const p = c.write(admin, "p", "p", {}, () =>
      c.createProject(admin, { name: "Private", goal: "Private" }),
    ),
    q = c.write(admin, "q", "q", {}, () =>
      c.createProject(admin, { name: "Public", goal: "Public", public: true }),
    );
  const a = c.write(admin, "a", "a", {}, () =>
    c.join(admin, p.id, {
      name: "Private harness",
      participantName: "Private human",
      model: "private-model",
    }),
  );
  const b = c.write(admin, "b", "b", {}, () =>
    c.join(admin, q.id, {
      name: "Public harness",
      participantId: a.agent.participantId,
    }),
  );
  assert.deepEqual(
    c.agents(undefined, q.id).map((x) => x.id),
    [b.agent.id],
  );
  assert.deepEqual(
    c.agents(admin, p.id).map((x) => x.id),
    [a.agent.id],
  );
  const actor = c.authenticate(a.token);
  for (let i = 0; i < 11; i++) {
    const t = c.write(actor, "t" + i, "task", {}, () =>
      c.task(actor, p.id, {
        title: "Task " + i,
        description: "Large description".repeat(100),
      }),
    );
    c.write(actor, "claim" + i, "claim", {}, () =>
      c.taskAction(actor, p.id, t.id, "claim"),
    );
  }
  const status = c.agents(actor, p.id)[0];
  assert.equal(status.leases.length, 10);
  assert.equal(status.leaseCount, 11);
  assert.equal(status.leases[0].task.description, undefined);
  c.close();
});
test("agent names never automatically mint independent participant votes", () => {
  const c = new Colab(":memory:", "secret");
  const p = c.write(admin, "p", "p", {}, () =>
    c.createProject(admin, { name: "Identity", goal: "Explicit identities" }),
  );
  assert.throws(() =>
    c.write(admin, "ambiguous", "join", {}, () =>
      c.join(admin, p.id, { name: "Just an agent" }),
    ),
  );
  const a = c.write(admin, "a", "join", {}, () =>
      c.join(admin, p.id, { name: "Owner A", role: "owner" }),
    ),
    b = c.write(admin, "b", "join", {}, () =>
      c.join(admin, p.id, { name: "Owner B", role: "owner" }),
    );
  assert.equal(a.agent.participantId, b.agent.participantId);
  const author = c.authenticate(a.token),
    reviewer = c.authenticate(b.token);
  const f = c.write(author, "f", "finding", {}, () =>
    c.finding(author, p.id, {
      title: "Claim",
      summary: "Summary",
      direction: "Identity",
      method: "Experiment",
      evidence: [{ description: "Log" }],
      reproduction: "Run it",
    }),
  );
  assert.throws(() =>
    c.write(reviewer, "review", "review", {}, () =>
      c.review(reviewer, p.id, {
        findingId: f.id,
        vote: "approve",
        environment: "Node",
        evidence: "Claimed success",
      }),
    ),
  );
  c.close();
});
