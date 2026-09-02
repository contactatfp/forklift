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
  const code = (err as { code?: unknown } | null)?.code;
  return code === "ConcurrencyLimitExceeded" || /concurrent|capacity|NoCapacity|Too many/i.test(msg);
}

/** The gateway's 429 body carries plan + cap; surface them so the log says what the org can run. */
function describeCap(err: unknown): string {
  const e = err as { cap?: unknown; plan?: unknown; body?: { cap?: unknown; plan?: unknown } } | null;
  const cap = e?.cap ?? e?.body?.cap;
  const plan = e?.plan ?? e?.body?.plan;
  if (cap === undefined && plan === undefined) return "";
  return ` (org cap ${String(cap ?? "?")}${plan ? `, plan ${String(plan)}` : ""})`;
}

/** How long a bay will sit waiting on the org's concurrency cap before it gives up. */
const SLOT_WAIT_MS = Math.max(30_000, Number(process.env.FORKLIFT_SLOT_WAIT_MS || 6 * 60_000) || 6 * 60_000);
const SLOT_POLL_MS = 10_000;

/**
 * Open a bay sandbox from the golden `base` template.
 * On the org's concurrency cap we wait, polling every 10s for up to
 * SLOT_WAIT_MS — a bay ahead of us takes ~4 minutes and the 429 is deterministic
 * until it closes. Warm snapshots are opt-in — Solari often 409s "Not
 * snapshottable" and the warm-up box itself burns a slot.
 */
export async function createReviewSandbox(
  owner: SandboxOwner,
  onWait?: (line: string) => void,
): Promise<Sandbox> {
  const client = sandboxClient();
  const metadata = { ...TAG, jobId: owner.jobId, bayId: owner.bayId };
  const started = Date.now();
  let lastErr: unknown;

  for (let attempt = 0; ; attempt++) {
    if (attempt > 0) {
      if (Date.now() - started > SLOT_WAIT_MS) break;
      await new Promise((r) => setTimeout(r, SLOT_POLL_MS));
    }
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
      if (attempt === 0) {
        const killed = await reclaimSandboxes("concurrency");
        onWait?.(
          `Solari says the org is at its concurrent-session cap${describeCap(err)}` +
            (killed ? ` · reclaimed ${killed} orphan${killed === 1 ? "" : "s"}` : "") +
            ` · waiting up to ${Math.round(SLOT_WAIT_MS / 60_000)} min for a slot`,
        );
      } else if (attempt % 6 === 0) {
        onWait?.(`still waiting for a sandbox slot · ${Math.round((Date.now() - started) / 1000)}s`);
      }
    }
  }

  const base = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`${base}${describeCap(lastErr)} — no sandbox slot freed up in ${Math.round(SLOT_WAIT_MS / 60_000)} min`);
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
