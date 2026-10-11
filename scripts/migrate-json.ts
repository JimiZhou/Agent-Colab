import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Colab } from "../packages/core/src/service.js";
const [source, target, identityFile] = process.argv.slice(2);
if (!source || !target)
  throw Error(
    "Usage: npm run migrate -- legacy-state.json destination.sqlite [participant-map.json]",
  );
const legacy = JSON.parse(readFileSync(source, "utf8"));
const identities: Record<string, string> = identityFile
  ? JSON.parse(readFileSync(identityFile, "utf8"))
  : {};
if (
  !identities ||
  typeof identities !== "object" ||
  Array.isArray(identities) ||
  Object.values(identities).some((x) => typeof x !== "string" || !x.trim())
)
  throw Error(
    "Participant map must be an object from legacy agent IDs to human identity labels",
  );
const c = new Colab(target, process.env.ADMIN_TOKEN || randomUUID());
if ((c.db.prepare("SELECT count(*) n FROM projects").get() as any).n)
  throw Error("Destination must be empty; original JSON is never modified");
const admin = {
  credentialId: "migration",
  participantId: "admin",
  admin: true,
};
c.db
  .transaction(() => {
    const participantMap = new Map<string, string>(),
      groups = new Map<string, string>();
    for (const p of legacy.projects || []) {
      const ownerId = randomUUID();
      c.db
        .prepare("INSERT INTO participants VALUES(?,?)")
        .run(ownerId, JSON.stringify({ id: ownerId, name: "Legacy owner" }));
      c.db.prepare("INSERT INTO projects VALUES(?,?,?)").run(
        p.id,
        ownerId,
        JSON.stringify({
          ...p,
          ownerId,
          public: false,
          threshold: 2,
          summary:
            "Imported legacy project; review identity and reissue credentials",
          stage: "Imported",
        }),
      );
      c.db
        .prepare("INSERT INTO memberships VALUES(?,?,?)")
        .run(p.id, ownerId, "owner");
      for (const a of (legacy.agents || []).filter(
        (a: any) => a.projectId === p.id,
      )) {
        const group = identities[a.id] || "legacy-agent:" + a.id;
        let participantId = groups.get(group);
        if (!participantId) {
          participantId = randomUUID();
          groups.set(group, participantId);
          c.db.prepare("INSERT INTO participants VALUES(?,?)").run(
            participantId,
            JSON.stringify({
              id: participantId,
              name: a.name,
              identityUnverified: !identities[a.id],
              migrationIdentityLabel: identities[a.id],
            }),
          );
        }
        participantMap.set(a.id, participantId);
        c.db.prepare("INSERT INTO agents VALUES(?,?,?)").run(
          a.id,
          participantId,
          JSON.stringify({
            id: a.id,
            participantId,
            name: a.name,
            harness: "legacy",
            legacyProjectId: p.id,
            createdAt: a.createdAt,
            lastActive: null,
          }),
        );
        c.db
          .prepare("INSERT OR IGNORE INTO memberships VALUES(?,?,?)")
          .run(p.id, participantId, "contributor");
      }
      for (const t of (legacy.tasks || []).filter(
        (t: any) => t.projectId === p.id,
      ))
        c.db.prepare("INSERT INTO tasks VALUES(?,?,?)").run(
          t.id,
          p.id,
          JSON.stringify({
            ...t,
            status: "open",
            assignee: null,
            dependencies: [],
            kind: "research",
          }),
        );
      for (const f of (legacy.findings || []).filter(
        (f: any) => f.projectId === p.id,
      )) {
        const author = participantMap.get(f.author) || ownerId;
        const item = {
          ...f,
          taskId: (legacy.tasks || []).some(
            (t: any) => t.id === f.taskId && t.projectId === p.id,
          )
            ? f.taskId
            : undefined,
          legacyTaskId: f.taskId,
          legacyAuthor: f.author,
          codeLinks: [],
          author,
          agentId: f.author === "admin" ? undefined : f.author,
          legacyStatus: f.status,
          status: "proposed",
          recognition: "pending",
          reproductionStatus: "unverified",
          evidence: [
            { id: randomUUID(), findingId: f.id, description: f.evidence },
          ],
          method: "Legacy import",
          summary: f.title,
          direction: "Legacy",
          reproduction: "See legacy evidence",
        };
        c.db
          .prepare("INSERT INTO findings VALUES(?,?,?,?)")
          .run(f.id, p.id, author, JSON.stringify(item));
        c.db
          .prepare("INSERT INTO evidence VALUES(?,?,?)")
          .run(item.evidence[0].id, f.id, JSON.stringify(item.evidence[0]));
      }
      for (const e of (legacy.events || []).filter(
        (e: any) => e.projectId === p.id,
      ))
        c.db
          .prepare("INSERT INTO events(id,project_id,data) VALUES(?,?,?)")
          .run(e.id, p.id, JSON.stringify(e));
      // Historical reviews are retained as audit data, not counted as independent votes.
      const reviews = (legacy.reviews || []).filter(
        (r: any) => r.projectId === p.id,
      );
      for (const review of reviews)
        c.event(p.id, admin, "legacy.reviewed", {
          review,
          countsTowardConsensus: false,
        });
      c.event(p.id, admin, "legacy.imported", {
        reviewCount: reviews.length,
        credentialsInvalidated: true,
        identityReconciliationRequired: !identityFile,
      });
    }
  })
  .immediate();
c.close();
console.log(
  "Imported into SQLite; all legacy tokens invalidated. Reconcile participants before issuing credentials.",
);
