import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export function openDatabase(file: string) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(
    `CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);`,
  );
  if (!db.prepare("SELECT 1 FROM migrations WHERE version=1").get())
    db.transaction(() => {
      db.exec(`
      CREATE TABLE participants(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE projects(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES participants(id), data TEXT NOT NULL);
      CREATE TABLE agents(id TEXT PRIMARY KEY, participant_id TEXT NOT NULL REFERENCES participants(id), data TEXT NOT NULL);
      CREATE TABLE memberships(project_id TEXT REFERENCES projects(id), participant_id TEXT REFERENCES participants(id), role TEXT NOT NULL CHECK(role IN ('owner','reviewer','contributor','reader')), PRIMARY KEY(project_id,participant_id));
      CREATE TABLE credentials(id TEXT PRIMARY KEY, hash TEXT UNIQUE NOT NULL, project_id TEXT REFERENCES projects(id), agent_id TEXT NOT NULL REFERENCES agents(id), expires_at INTEGER NOT NULL, revoked_at INTEGER, data TEXT NOT NULL);
      CREATE TABLE tasks(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), data TEXT NOT NULL);
      CREATE TABLE leases(task_id TEXT PRIMARY KEY REFERENCES tasks(id), agent_id TEXT NOT NULL REFERENCES agents(id), expires_at INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE findings(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), author_id TEXT NOT NULL REFERENCES participants(id), data TEXT NOT NULL);
      CREATE TABLE evidence(id TEXT PRIMARY KEY, finding_id TEXT NOT NULL REFERENCES findings(id), data TEXT NOT NULL);
      CREATE TABLE reviews(id TEXT PRIMARY KEY, finding_id TEXT NOT NULL REFERENCES findings(id), participant_id TEXT NOT NULL REFERENCES participants(id), data TEXT NOT NULL, UNIQUE(finding_id,participant_id));
      CREATE TABLE events(sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id), data TEXT NOT NULL);
      CREATE TABLE repository_links(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), data TEXT NOT NULL);
      CREATE TABLE idempotency(credential_id TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(credential_id,key));
      CREATE INDEX tasks_project ON tasks(project_id);
      CREATE INDEX findings_project ON findings(project_id);
      CREATE INDEX events_project ON events(project_id,sequence);
      CREATE INDEX credentials_project ON credentials(project_id);
    `);
      db.prepare("INSERT INTO migrations VALUES(1,?)").run(
        new Date().toISOString(),
      );
    }).immediate();
  return db;
}
