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
    assert.equal(c.get("findings", f).evidence[0].description, "Legacy log");
    assert.equal(c.db.prepare("SELECT * FROM credentials").all().length, 0);
    assert.throws(() => c.authenticate("legacy-token"));
    const events = c.events(c.authenticate("admin-secret"), p, {});
    assert.equal(events[0].detail.reviews.length, 1);
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
