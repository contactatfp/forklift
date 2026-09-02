import { SandboxClient, type Sandbox } from "@solarisdk/sandbox";
import { Solari } from "@solarisdk/browser";
import { log } from "@/lib/log";

const BASE = process.env.SOLARI_BASE_URL ?? "https://api.getsolari.com";

/**
 * Every sandbox we open carries this tag. Reclaim only ever touches tagged boxes,
 * so running Forklift on a shared key can't kill someone else's work.
 */
const TAG = { app: "forklift" } as const;

const BAY_CREATE = {
  cpu: 2,
  memMb: 4096,
  timeoutMs: 12 * 60 * 1000,
  lifecycle: { onTimeout: "kill" as const },
};

export type SandboxOwner = { jobId: string; bayId: string };

export function hasSolariKey(): boolean {
  return Boolean(process.env.SOLARI_API_KEY) && process.env.FORKLIFT_FIXTURE !== "1";
}

export function sandboxClient(): SandboxClient {
  const apiKey = process.env.SOLARI_API_KEY;
  if (!apiKey) throw new Error("SOLARI_API_KEY is missing");
  return new SandboxClient({ apiKey, baseUrl: BASE });
}

export function browserClient(): Solari {
  const apiKey = process.env.SOLARI_API_KEY;
  if (!apiKey) throw new Error("SOLARI_API_KEY is missing");
  return new Solari({ apiKey, baseUrl: BASE });
}

const live = new Set<Sandbox>();

export function trackSandbox(sbx: Sandbox) {
  live.add(sbx);
}

export function untrackSandbox(sbx: Sandbox) {
  live.delete(sbx);
}

export async function killAllSandboxes() {
  const all = [...live];
  live.clear();
  await Promise.all(
    all.map(async (sbx) => {
      try {
        await sbx.kill();
      } catch (err) {
        log("sandbox.kill.fail", { err: String(err) });
      }
    }),
  );
}

/**
 * Kill Forklift-tagged sandboxes that nobody in this process is using, so a
 * prior crashed job doesn't eat the concurrency budget. Untagged sandboxes on
 * the same key are never touched.
 */
export async function reclaimSandboxes(reason: string): Promise<number> {
  const client = sandboxClient();
  const inUse = new Set([...live].map((sbx) => sbx.id));
  let killed = 0;
  try {
    for await (const view of client.listAll({ metadata: TAG })) {
      if (inUse.has(view.sandboxId)) continue;
      try {
        await client.kill(view.sandboxId);
        killed += 1;
      } catch (err) {
        log("sandbox.reclaim.fail", { id: view.sandboxId, err: String(err) });
      }
    }
  } catch (err) {
    log("sandbox.reclaim.list.fail", { reason, err: String(err) });
  }
  log("sandbox.reclaim", { reason, killed, skipped: inUse.size });
  return killed;
}

function isConcurrencyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /concurrent|capacity|NoCapacity|Too many/i.test(msg);
}

/**
 * Open a bay sandbox from the golden `base` template.
 * Warm snapshots are opt-in — Solari often 409s "Not snapshottable" and the
 * warm-up box itself burns a concurrency slot the five bays need.
 */
export async function createReviewSandbox(owner: SandboxOwner): Promise<Sandbox> {
  const client = sandboxClient();
  const delays = [0, 2_000, 4_000, 8_000, 12_000];
  const metadata = { ...TAG, jobId: owner.jobId, bayId: owner.bayId };
  let lastErr: unknown;

  for (let attempt = 0; attempt < delays.length; attempt++) {
    const delay = delays[attempt] ?? 0;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      if (process.env.FORKLIFT_WARM_SNAPSHOT === "1" && attempt === 0) {
        const snapId = await workerSnapshot();
        if (snapId) {
          try {
            const sbx = await client.create({ ...BAY_CREATE, metadata, fromSnapshot: snapId });
            log("sandbox.boot", { via: "snapshot", snapId, id: sbx.id });
            return sbx;
          } catch (err) {
            log("sandbox.fromSnapshot.fail", { snapId, err: String(err) });
          }
        }
      }
      const sbx = await client.create({ ...BAY_CREATE, metadata, template: "base" });
      log("sandbox.boot", { via: "template", id: sbx.id, attempt });
      return sbx;
    } catch (err) {
      lastErr = err;
      if (!isConcurrencyError(err)) throw err;
      log("sandbox.create.retry", { attempt, err: String(err) });
      if (attempt === 0) await reclaimSandboxes("concurrency");
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

const globalSnap = globalThis as unknown as {
  forkliftSnap?: Promise<string | null>;
};

/** Opt-in warm snapshot. null on failure — never rejects. */
export function workerSnapshot(): Promise<string | null> {
  if (!globalSnap.forkliftSnap) {
    globalSnap.forkliftSnap = buildWorkerSnapshot().then(
      (id) => id,
      (err) => {
        log("snapshot.fail", { err: String(err) });
        return null;
      },
    );
  }
  return globalSnap.forkliftSnap;
}

async function buildWorkerSnapshot(): Promise<string> {
  const client = sandboxClient();
  const sbx = await client.create({
    template: "base",
    cpu: 2,
    memMb: 4096,
    timeoutMs: 10 * 60 * 1000,
    lifecycle: { onTimeout: "kill" },
    metadata: { ...TAG, role: "warm-snapshot" },
  });
  trackSandbox(sbx);
  try {
    await sbx.connect();
    await sbx.commands.run("node", { args: ["--version"] });
    await sbx.commands.run("python3", { args: ["--version"] });
    await sbx.commands.run("git", { args: ["--version"] });
    const id = await sbx.snapshot("forklift-worker");
    log("snapshot.ready", { id });
    return id;
  } finally {
    untrackSandbox(sbx);
    await sbx.kill();
  }
}
