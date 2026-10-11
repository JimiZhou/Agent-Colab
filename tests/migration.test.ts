import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Colab } from "../packages/core/src/service.js";
test("legacy import preserves artifacts and audit reviews without reviving tokens or untrusted consensus", () => {
  const dir = mkdtempSync(join(tmpdir(), "colab-import-")),
    source = join(dir, "state.json"),
    target = join(dir, "new.sqlite");
  const p = randomUUID(),
    a = randomUUID(),
    t = randomUUID(),
    f = randomUUID();
  const legacy = {
    projects: [{ id: p, name: "Old project", goal: "Goal", mode: "community" }],
    agents: [{ id: a, projectId: p, name: "Agent", token: "legacy-token" }],
    tasks: [{ id: t, projectId: p, title: "Task", status: "open" }],
    findings: [
      {
        id: f,
        projectId: p,
        author: a,
        title: "Finding",
        taskId: t,
        evidence: "Legacy log",
        status: "verified",
      },
    ],
    reviews: [
      {
        id: randomUUID(),
        projectId: p,
        findingId: f,
        actor: randomUUID(),
        vote: "approve",
      },
    ],
    events: [],
  };
  const original = JSON.stringify(legacy);
  writeFileSync(source, original);
  try {
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/migrate-json.ts", source, target],
      { cwd: process.cwd() },
    );
    const c = new Colab(target, "admin-secret");
    assert.equal(c.get("projects", p).public, false);
    assert.equal(c.get("findings", f).status, "proposed");
    assert.equal(c.agents(c.authenticate("admin-secret"), p)[0].id, a);
    assert.equal(c.get("findings", f).evidence[0].description, "Legacy log");
    assert.equal(c.db.prepare("SELECT * FROM credentials").all().length, 0);
    assert.throws(() => c.authenticate("legacy-token"));
    const events = c.events(c.authenticate("admin-secret"), p, {});
    assert.equal(
      events.find((e) => e.type === "legacy.imported")!.detail.reviewCount,
      1,
    );
    assert.equal(
      events.find((e) => e.type === "legacy.reviewed")!.detail.review.vote,
      "approve",
    );
    assert.equal(readFileSync(source, "utf8"), original);
    c.close();
    assert.throws(() =>
      execFileSync(
        process.execPath,
        ["--import", "tsx", "scripts/migrate-json.ts", source, target],
        { stdio: "pipe" },
      ),
    );
  } finally {
    rmSync(dir, { recursive: true });
  }
});
test("migration groups same-human agents and quarantines legacy cross-project task references", () => {
  const dir = mkdtempSync(join(tmpdir(), "colab-map-")),
    source = join(dir, "state.json"),
    target = join(dir, "db.sqlite"),
    map = join(dir, "participants.json");
  const p = randomUUID(),
    q = randomUUID(),
    a = randomUUID(),
    b = randomUUID(),
    d = randomUUID(),
    t = randomUUID(),
    f = randomUUID();
  writeFileSync(
    source,
    JSON.stringify({
      projects: [
        { id: p, name: "A", goal: "A", mode: "community" },
        { id: q, name: "B", goal: "B", mode: "owner" },
      ],
      agents: [
        { id: a, name: "A1", projectId: p },
        { id: b, name: "A2", projectId: p },
        { id: d, name: "A3", projectId: q },
      ],
      tasks: [{ id: t, projectId: q, title: "Foreign task" }],
      findings: [
        {
          id: f,
          projectId: p,
          author: a,
          title: "Legacy claim",
          evidence: "Log",
          taskId: t,
          status: "verified",
        },
      ],
    }),
  );
  writeFileSync(
    map,
    JSON.stringify({ [a]: "one-human", [b]: "one-human", [d]: "one-human" }),
  );
  try {
    execFileSync(process.execPath, [
      "--import",
      "tsx",
      "scripts/migrate-json.ts",
      source,
      target,
      map,
    ]);
    const c = new Colab(target, "secret");
    const participant = c.get("agents", a).participantId;
    assert.equal(c.get("agents", b).participantId, participant);
    assert.equal(c.get("agents", d).participantId, participant);
    assert.equal(
      (c.db.prepare("SELECT count(*) n FROM participants").get() as any).n,
      3,
    );
    const finding = c.get("findings", f);
    assert.equal(finding.taskId, undefined);
    assert.equal(finding.legacyTaskId, t);
    assert.deepEqual(finding.codeLinks, []);
    assert.equal(c.get("evidence", finding.evidence[0].id).description, "Log");
    c.close();
  } finally {
    rmSync(dir, { recursive: true });
  }
});
