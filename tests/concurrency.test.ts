import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Colab } from "../packages/core/src/service.js";
test("two independent processes claim the same SQLite task: exactly one wins", async () => {
  const dir = mkdtempSync(join(tmpdir(), "colab-race-")),
    file = join(dir, "db.sqlite"),
    c = new Colab(file, "secret");
  const admin = c.authenticate("secret");
  const p = c.write(admin, "p", "p", {}, () =>
    c.createProject(admin, { name: "Race", goal: "Atomic claims" }),
  );
  const agents = ["A", "B"].map((name) =>
    c.write(admin, name, "join", { name }, () => c.join(admin, p.id, { name })),
  );
  const t = c.write(admin, "task", "task", {}, () =>
    c.task(admin, p.id, { title: "Exclusive" }),
  );
  c.close();
  const code = `import {Colab} from './packages/core/src/service.ts';const c=new Colab(process.env.CLAIM_DB,'secret');try{const a=c.authenticate(process.env.CLAIM_TOKEN);c.write(a,'claim','claim',{},()=>c.taskAction(a,process.env.CLAIM_PROJECT,process.env.CLAIM_TASK,'claim'));console.log(200);}catch(e){console.log(e.status||500);}finally{c.close();}`;
  try {
    const statuses = await Promise.all(
      agents.map(
        (a) =>
          new Promise<number>((resolve, reject) => {
            const child = spawn(
              process.execPath,
              ["--import", "tsx", "--input-type=module", "-e", code],
              {
                env: {
                  ...process.env,
                  CLAIM_DB: file,
                  CLAIM_TOKEN: a.token,
                  CLAIM_PROJECT: p.id,
                  CLAIM_TASK: t.id,
                },
                stdio: ["ignore", "pipe", "pipe"],
              },
            );
            let output = "",
              error = "";
            child.stdout.on("data", (x) => (output += x));
            child.stderr.on("data", (x) => (error += x));
            child.on("error", reject);
            child.on("exit", (code) =>
              code ? reject(Error(error)) : resolve(Number(output.trim())),
            );
          }),
      ),
    );
    assert.deepEqual(statuses.sort(), [200, 409]);
    const check = new Colab(file, "secret");
    assert.equal(check.db.prepare("SELECT * FROM leases").all().length, 1);
    assert.equal(check.get("tasks", t.id).status, "claimed");
    check.close();
  } finally {
    rmSync(dir, { recursive: true });
  }
});
