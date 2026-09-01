export type JobKind = "contest" | "verify";

export type JobStatus =
  | "queued"
  | "discovering"
  | "reviewing"
  | "done"
  | "failed";

export type BayStatus =
  | "queued"
  | "cloning"
  | "scanning"
  | "installing"
  | "testing"
  | "building"
  | "preview"
  | "recording"
  | "done"
  | "failed";

export type StackKind = "node" | "python" | "unknown";

export type DemoStep =
  | { action: "goto"; path: string }
  | { action: "click"; text?: string; selector?: string }
  | { action: "wait"; ms?: number; selector?: string; text?: string; timeoutMs?: number }
  | { action: "screenshot" };

export type ForkliftManifest = {
  name?: string;
  stack?: StackKind;
  install?: string;
  start?: string;
  port?: number;
  health?: string;
  tests?: string;
  timeoutMinutes?: number;
  demo?: DemoStep[];
};

export type GithubRepo = {
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
  cloneUrl: string;
};

export type ForkHit = GithubRepo & {
  pushedAt: string;
  createdAt: string;
  stars: number;
  aheadBy: number | null;
  changedFiles: number | null;
};

export type DiffEvidence = {
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: Array<{ path: string; status: string }>;
  newTopLevel: string[];
};

export type SolariDetection = {
  sandbox: boolean;
  browser: boolean;
  desktop: boolean;
  recording: boolean;
  packages: string[];
  importHits: string[];
};

export type ReadmeCheck = {
  claimedStart: string | null;
  startExists: boolean;
  claimedPort: number | null;
  portMatched: boolean;
  mentionsSolari: boolean;
  solariInCode: boolean;
};

export type CriterionResult =
  | { label: string; kind: "auto"; met: boolean; note: string }
  | { label: string; kind: "manual"; note: string };

export type Evidence = {
  stack: StackKind;
  build: { ok: boolean; exitCode: number | null; summary: string };
  tests: { ran: boolean; ok: boolean | null; summary: string };
  diff: DiffEvidence;
  previewUrl: string | null;
  replayUrl: string | null;
  consoleErrors: string[];
  networkErrors: string[];
  solari: SolariDetection;
  readme: ReadmeCheck;
  criteria: CriterionResult[];
  secretsFound: string[];
  manifestUsed: boolean;
};

export type Job = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  upstream: string;
  criteria: string[];
  selfRepo: string | null;
  forkCount: number | null;
  error: string | null;
  fixture: boolean;
  createdAt: number;
  updatedAt: number;
};

export type Bay = {
  id: string;
  jobId: string;
  bay: number;
  repo: GithubRepo;
  isSelf: boolean;
  status: BayStatus;
  logs: string[];
  evidence: Evidence | null;
  hasScreenshot: boolean;
  error: string | null;
  sandboxId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type EngineEvent =
  | { type: "job"; job: Job }
  | { type: "bay"; bay: Bay }
  | { type: "log"; jobId: string; bayId: string; line: string }
  | { type: "heartbeat" };

export type CreateJobInput = {
  kind: JobKind;
  upstream: string;
  criteria: string[];
  selfRepo: string | null;
  verifyUrl?: string;
};
