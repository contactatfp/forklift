import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { log } from "@/lib/log";
import type { Bay, BayStatus, Evidence, Job, JobKind, JobStatus } from "@/lib/types";

const DDL = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  upstream TEXT NOT NULL,
  criteria TEXT NOT NULL,
  self_repo TEXT,
  fork_count INTEGER,
  error TEXT,
  fixture INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bays (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  bay INTEGER NOT NULL,
  repo_json TEXT NOT NULL,
  is_self INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  logs TEXT NOT NULL DEFAULT '[]',
  evidence TEXT,
  screenshot BLOB,
  error TEXT,
  sandbox_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bays_job ON bays(job_id);
`;

type JobRow = {
  id: string;
  kind: string;
  status: string;
  upstream: string;
  criteria: string;
  self_repo: string | null;
  fork_count: number | null;
  error: string | null;
  fixture: number | boolean;
  created_at: number | string;
  updated_at: number | string;
};

type BayRow = {
  id: string;
  job_id: string;
  bay: number;
  repo_json: string;
  is_self: number | boolean;
  status: string;
  logs: string;
  evidence: string | null;
  error: string | null;
  sandbox_id: string | null;
  created_at: number | string;
  updated_at: number | string;
};

function num(value: number | string): number {
  return typeof value === "string" ? Number(value) : value;
}

function asBool(value: number | boolean): boolean {
  return value === true || value === 1;
}

function jobFromRow(row: JobRow): Job {
  const parsed: unknown = JSON.parse(row.criteria);
  const criteria = Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
  return {
    id: row.id,
    kind: row.kind as JobKind,
    status: row.status as JobStatus,
    upstream: row.upstream,
    criteria,
    selfRepo: row.self_repo,
    forkCount: row.fork_count === null ? null : Number(row.fork_count),
    error: row.error,
    fixture: asBool(row.fixture),
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
  };
}

function bayFromRow(row: BayRow, hasScreenshot: boolean): Bay {
  const repoUnknown: unknown = JSON.parse(row.repo_json);
  const evidenceUnknown: unknown = row.evidence ? JSON.parse(row.evidence) : null;
  const logsUnknown: unknown = JSON.parse(row.logs);
  return {
    id: row.id,
    jobId: row.job_id,
    bay: Number(row.bay),
    repo: repoUnknown as Bay["repo"],
    isSelf: asBool(row.is_self),
    status: row.status as BayStatus,
    logs: Array.isArray(logsUnknown)
      ? logsUnknown.filter((item): item is string => typeof item === "string")
      : [],
    evidence: evidenceUnknown as Evidence | null,
    hasScreenshot,
    error: row.error,
    sandboxId: row.sandbox_id,
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
  };
}

export type Store = {
  createJob: (job: Job) => Promise<void>;
  getJob: (id: string) => Promise<Job | null>;
  updateJob: (
    id: string,
    patch: Partial<Pick<Job, "status" | "forkCount" | "error" | "fixture">>,
  ) => Promise<Job | null>;
  upsertBay: (bay: Bay) => Promise<void>;
  getBay: (id: string) => Promise<Bay | null>;
  listBays: (jobId: string) => Promise<Bay[]>;
  appendLog: (bayId: string, line: string) => Promise<string[]>;
  setEvidence: (bayId: string, evidence: Evidence, extra?: { sandboxId?: string | null; error?: string | null; status?: BayStatus }) => Promise<void>;
  setScreenshot: (bayId: string, png: Uint8Array) => Promise<void>;
  getScreenshot: (bayId: string) => Promise<Uint8Array | null>;
};

class SqliteStore implements Store {
  private db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(DDL);
  }

  async createJob(job: Job) {
    this.db
      .prepare(
        `INSERT INTO jobs (id, kind, status, upstream, criteria, self_repo, fork_count, error, fixture, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        job.id,
        job.kind,
        job.status,
        job.upstream,
        JSON.stringify(job.criteria),
        job.selfRepo,
        job.forkCount,
        job.error,
        job.fixture ? 1 : 0,
        job.createdAt,
        job.updatedAt,
      );
  }

  async getJob(id: string) {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
    return row ? jobFromRow(row as JobRow) : null;
  }

  async updateJob(id: string, patch: Partial<Pick<Job, "status" | "forkCount" | "error" | "fixture">>) {
    const current = await this.getJob(id);
    if (!current) return null;
    const next: Job = {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    };
    this.db
      .prepare(
        `UPDATE jobs SET status = ?, fork_count = ?, error = ?, fixture = ?, updated_at = ? WHERE id = ?`,
      )
      .run(next.status, next.forkCount, next.error, next.fixture ? 1 : 0, next.updatedAt, id);
    return next;
  }

  async upsertBay(bay: Bay) {
    this.db
      .prepare(
        `INSERT INTO bays (id, job_id, bay, repo_json, is_self, status, logs, evidence, error, sandbox_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           logs = excluded.logs,
           evidence = excluded.evidence,
           error = excluded.error,
           sandbox_id = excluded.sandbox_id,
           updated_at = excluded.updated_at`,
      )
      .run(
        bay.id,
        bay.jobId,
        bay.bay,
        JSON.stringify(bay.repo),
        bay.isSelf ? 1 : 0,
        bay.status,
        JSON.stringify(bay.logs),
        bay.evidence ? JSON.stringify(bay.evidence) : null,
        bay.error,
        bay.sandboxId,
        bay.createdAt,
        bay.updatedAt,
      );
  }

  async getBay(id: string) {
    const row = this.db
      .prepare("SELECT id, job_id, bay, repo_json, is_self, status, logs, evidence, error, sandbox_id, created_at, updated_at, screenshot IS NOT NULL AS has_shot FROM bays WHERE id = ?")
      .get(id) as (BayRow & { has_shot: number }) | undefined;
    if (!row) return null;
    return bayFromRow(row, Boolean(row.has_shot));
  }

  async listBays(jobId: string) {
    const rows = this.db
      .prepare(
        "SELECT id, job_id, bay, repo_json, is_self, status, logs, evidence, error, sandbox_id, created_at, updated_at, screenshot IS NOT NULL AS has_shot FROM bays WHERE job_id = ? ORDER BY bay ASC",
      )
      .all(jobId) as Array<BayRow & { has_shot: number }>;
    return rows.map((row) => bayFromRow(row, Boolean(row.has_shot)));
  }

  async appendLog(bayId: string, line: string) {
    const row = this.db.prepare("SELECT logs FROM bays WHERE id = ?").get(bayId) as
      | { logs: string }
      | undefined;
    const parsed: unknown = row ? JSON.parse(row.logs) : [];
    const logs = Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
    logs.push(line);
    const clipped = logs.slice(-400);
    this.db
      .prepare("UPDATE bays SET logs = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(clipped), Date.now(), bayId);
    return clipped;
  }

  async setEvidence(
    bayId: string,
    evidence: Evidence,
    extra?: { sandboxId?: string | null; error?: string | null; status?: BayStatus },
  ) {
    const current = await this.getBay(bayId);
    if (!current) return;
    this.db
      .prepare(
        `UPDATE bays SET evidence = ?, sandbox_id = ?, error = ?, status = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        JSON.stringify(evidence),
        extra?.sandboxId === undefined ? current.sandboxId : extra.sandboxId,
        extra?.error === undefined ? current.error : extra.error,
        extra?.status ?? current.status,
        Date.now(),
        bayId,
      );
  }

  async setScreenshot(bayId: string, png: Uint8Array) {
    this.db
      .prepare("UPDATE bays SET screenshot = ?, updated_at = ? WHERE id = ?")
      .run(png, Date.now(), bayId);
  }

  async getScreenshot(bayId: string) {
    const row = this.db.prepare("SELECT screenshot FROM bays WHERE id = ?").get(bayId) as
      | { screenshot: Uint8Array | null }
      | undefined;
    return row?.screenshot ?? null;
  }
}

class PostgresStore implements Store {
  private pool: pg.Pool;

  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: 4 });
  }

  async init() {
    await this.pool.query(DDL.replaceAll("BLOB", "BYTEA").replaceAll("INTEGER NOT NULL DEFAULT 0", "SMALLINT NOT NULL DEFAULT 0"));
  }

  async createJob(job: Job) {
    await this.pool.query(
      `INSERT INTO jobs (id, kind, status, upstream, criteria, self_repo, fork_count, error, fixture, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        job.id,
        job.kind,
        job.status,
        job.upstream,
        JSON.stringify(job.criteria),
        job.selfRepo,
        job.forkCount,
        job.error,
        job.fixture ? 1 : 0,
        job.createdAt,
        job.updatedAt,
      ],
    );
  }

  async getJob(id: string) {
    const res = await this.pool.query("SELECT * FROM jobs WHERE id = $1", [id]);
    const row = res.rows[0] as JobRow | undefined;
    return row ? jobFromRow(row) : null;
  }

  async updateJob(id: string, patch: Partial<Pick<Job, "status" | "forkCount" | "error" | "fixture">>) {
    const current = await this.getJob(id);
    if (!current) return null;
    const next: Job = { ...current, ...patch, updatedAt: Date.now() };
    await this.pool.query(
      `UPDATE jobs SET status = $1, fork_count = $2, error = $3, fixture = $4, updated_at = $5 WHERE id = $6`,
      [next.status, next.forkCount, next.error, next.fixture ? 1 : 0, next.updatedAt, id],
    );
    return next;
  }

  async upsertBay(bay: Bay) {
    await this.pool.query(
      `INSERT INTO bays (id, job_id, bay, repo_json, is_self, status, logs, evidence, error, sandbox_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         logs = EXCLUDED.logs,
         evidence = EXCLUDED.evidence,
         error = EXCLUDED.error,
         sandbox_id = EXCLUDED.sandbox_id,
         updated_at = EXCLUDED.updated_at`,
      [
        bay.id,
        bay.jobId,
        bay.bay,
        JSON.stringify(bay.repo),
        bay.isSelf ? 1 : 0,
        bay.status,
        JSON.stringify(bay.logs),
        bay.evidence ? JSON.stringify(bay.evidence) : null,
        bay.error,
        bay.sandboxId,
        bay.createdAt,
        bay.updatedAt,
      ],
    );
  }

  async getBay(id: string) {
    const res = await this.pool.query(
      `SELECT id, job_id, bay, repo_json, is_self, status, logs, evidence, error, sandbox_id, created_at, updated_at,
              (screenshot IS NOT NULL) AS has_shot FROM bays WHERE id = $1`,
      [id],
    );
    const row = res.rows[0] as (BayRow & { has_shot: boolean }) | undefined;
    if (!row) return null;
    return bayFromRow(row, Boolean(row.has_shot));
  }

  async listBays(jobId: string) {
    const res = await this.pool.query(
      `SELECT id, job_id, bay, repo_json, is_self, status, logs, evidence, error, sandbox_id, created_at, updated_at,
              (screenshot IS NOT NULL) AS has_shot FROM bays WHERE job_id = $1 ORDER BY bay ASC`,
      [jobId],
    );
    return (res.rows as Array<BayRow & { has_shot: boolean }>).map((row) =>
      bayFromRow(row, Boolean(row.has_shot)),
    );
  }

  async appendLog(bayId: string, line: string) {
    const res = await this.pool.query("SELECT logs FROM bays WHERE id = $1", [bayId]);
    const row = res.rows[0] as { logs: string } | undefined;
    const parsed: unknown = row ? JSON.parse(row.logs) : [];
    const logs = Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
    logs.push(line);
    const clipped = logs.slice(-400);
    await this.pool.query("UPDATE bays SET logs = $1, updated_at = $2 WHERE id = $3", [
      JSON.stringify(clipped),
      Date.now(),
      bayId,
    ]);
    return clipped;
  }

  async setEvidence(
    bayId: string,
    evidence: Evidence,
    extra?: { sandboxId?: string | null; error?: string | null; status?: BayStatus },
  ) {
    const current = await this.getBay(bayId);
    if (!current) return;
    await this.pool.query(
      `UPDATE bays SET evidence = $1, sandbox_id = $2, error = $3, status = $4, updated_at = $5 WHERE id = $6`,
      [
        JSON.stringify(evidence),
        extra?.sandboxId === undefined ? current.sandboxId : extra.sandboxId,
        extra?.error === undefined ? current.error : extra.error,
        extra?.status ?? current.status,
        Date.now(),
        bayId,
      ],
    );
  }

  async setScreenshot(bayId: string, png: Uint8Array) {
    await this.pool.query("UPDATE bays SET screenshot = $1, updated_at = $2 WHERE id = $3", [
      Buffer.from(png),
      Date.now(),
      bayId,
    ]);
  }

  async getScreenshot(bayId: string) {
    const res = await this.pool.query("SELECT screenshot FROM bays WHERE id = $1", [bayId]);
    const row = res.rows[0] as { screenshot: Buffer | null } | undefined;
    if (!row?.screenshot) return null;
    return new Uint8Array(row.screenshot);
  }
}

const globalForStore = globalThis as unknown as { forkliftStore?: Promise<Store> };

export function getStore(): Promise<Store> {
  if (!globalForStore.forkliftStore) {
    globalForStore.forkliftStore = (async () => {
      const url = process.env.DATABASE_URL;
      if (url && url.startsWith("postgres")) {
        log("store.postgres");
        const store = new PostgresStore(url);
        await store.init();
        return store;
      }
      const path = process.env.FORKLIFT_DB ?? join(process.cwd(), "data", "forklift.sqlite");
      log("store.sqlite", { path });
      return new SqliteStore(path);
    })();
  }
  return globalForStore.forkliftStore;
}
