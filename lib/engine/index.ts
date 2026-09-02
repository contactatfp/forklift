import { fixtureBay } from "@/lib/engine/fixture";
import { getHub } from "@/lib/engine/events";
import { reviewBay } from "@/lib/engine/pipeline";
import { slotLimit, withSlot } from "@/lib/engine/slots";
import { listForks, pickReviewSet } from "@/lib/github/forks";
import { parseGithubRepo, sameRepo } from "@/lib/github/parse";
import { newId } from "@/lib/ids";
import { log } from "@/lib/log";
import { hasSolariKey, killAllSandboxes, reclaimSandboxes } from "@/lib/solari/clients";
import { getStore } from "@/lib/store";
import type { Bay, CreateJobInput, ForkHit, Job } from "@/lib/types";

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const width = Math.max(1, Math.min(limit, items.length || 1));
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      const item = items[idx];
      if (item !== undefined) await fn(item);
    }
  }
  await Promise.all(Array.from({ length: width }, () => worker()));
}

const globalEngine = globalThis as unknown as {
  forkliftEngine?: { started: boolean; shuttingDown: boolean };
};

function state() {
  if (!globalEngine.forkliftEngine) {
    globalEngine.forkliftEngine = { started: false, shuttingDown: false };
  }
  return globalEngine.forkliftEngine;
}

export function startEngine() {
  const s = state();
  if (s.started) return;
  s.started = true;
  log("engine.start", { fixture: !hasSolariKey() });
  const halt = () => {
    if (s.shuttingDown) return;
    s.shuttingDown = true;
    log("engine.shutdown");
    void killAllSandboxes();
  };
  process.on("SIGTERM", halt);
  process.on("SIGINT", halt);
}

export async function enqueueJob(input: CreateJobInput): Promise<Job> {
  startEngine();
  const store = await getStore();
  const job: Job = {
    id: newId(),
    kind: input.kind,
    status: "queued",
    upstream: input.upstream,
    criteria: input.criteria,
    selfRepo: input.selfRepo,
    forkCount: null,
    error: null,
    fixture: !hasSolariKey(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await store.createJob(job);
  void runJob(job.id, input);
  return job;
}

async function runJob(jobId: string, input: CreateJobInput) {
  const store = await getStore();
  const hub = getHub();
  try {
    let job = await store.updateJob(jobId, { status: "discovering" });
    if (!job) return;
    hub.publish(jobId, { type: "job", job });

    const upstream = parseGithubRepo(input.upstream);
    try {
      const meta = await fetch(`https://api.github.com/repos/${upstream.owner}/${upstream.name}`, {
        headers: process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : undefined,
      });
      if (meta.ok) {
        const body: unknown = await meta.json();
        if (body && typeof body === "object" && "default_branch" in body && typeof body.default_branch === "string") {
          upstream.defaultBranch = body.default_branch;
        }
      }
    } catch {
      /* keep main */
    }

    const selfRepo =
      input.selfRepo === "none"
        ? null
        : !input.selfRepo || input.selfRepo === "local" || input.selfRepo === "."
          ? input.kind === "contest"
            ? {
                owner: "local",
                name: "forklift",
                url: "local://forklift",
                defaultBranch: "main",
                cloneUrl: "local://",
              }
            : null
          : (() => {
              // GitHub URL is a label; bay 05 always packs this deployed tree
              const parsed = parseGithubRepo(input.selfRepo);
              return { ...parsed, cloneUrl: "local://" };
            })();
    let forks: ForkHit[] = [];
    if (input.kind === "contest") {
      forks = await listForks(upstream);
      job = await store.updateJob(jobId, { status: "discovering", forkCount: forks.length });
      if (job) hub.publish(jobId, { type: "job", job });
    }

    const picked = await pickReviewSet({
      upstream,
      forks,
      selfRepo,
      verifyUrl: input.verifyUrl,
      limit: input.kind === "verify" ? 1 : 5,
    });

    if (picked.length === 0) {
      throw new Error("No forks with changes to review");
    }

    const bays: Bay[] = picked.map((fork, i) => ({
      id: newId(),
      jobId,
      bay: i + 1,
      repo: {
        owner: fork.owner,
        name: fork.name,
        url: fork.url,
        defaultBranch: fork.defaultBranch,
        cloneUrl: fork.cloneUrl,
        // GitHub compare numbers ride along so a dry run can show something true
        aheadBy: fork.aheadBy,
        changedFiles: fork.changedFiles,
      },
      isSelf: Boolean(selfRepo && sameRepo(fork, selfRepo)),
      status: "queued",
      mode: null,
      logs: [],
      evidence: null,
      hasScreenshot: false,
      error: null,
      sandboxId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    // keep Forklift last on the floor even if pick order shuffled
    bays.sort((a, b) => Number(a.isSelf) - Number(b.isSelf));
    bays.forEach((bay, i) => {
      bay.bay = i + 1;
    });

    for (const bay of bays) {
      await store.upsertBay(bay);
      hub.publish(jobId, { type: "bay", bay });
    }

    job = await store.updateJob(jobId, { status: "reviewing" });
    if (job) hub.publish(jobId, { type: "job", job });

    const live = hasSolariKey();
    if (live) {
      // drop our own orphans from earlier failed floors before we stampede create()
      await reclaimSandboxes("job-start");
    }

    // per-floor width; the process-wide gate in slots.ts is what actually respects the org cap
    const pool = live ? slotLimit() : bays.length;

    await mapPool(bays, pool, async (bay) => {
      try {
        if (live) {
          await withSlot(
            (ahead) => {
              bay.logs.push(`waiting for a sandbox slot · ${ahead} bay${ahead === 1 ? "" : "s"} ahead`);
              void store.upsertBay(bay);
              hub.publish(jobId, { type: "log", jobId, bayId: bay.id, line: bay.logs[bay.logs.length - 1]! });
            },
            () => reviewBay({ bay, upstream, criteria: input.criteria }),
          );
        } else await fixtureBay({ bay, criteria: input.criteria });
      } catch (err) {
        // reviewBay / fixtureBay already stamp the bay; this is a last-resort net
        const message = err instanceof Error ? err.message : String(err);
        log("bay.unhandled", { bayId: bay.id, err: message });
        if (bay.status !== "done" && bay.status !== "failed") {
          bay.status = "failed";
          bay.error = message;
          await store.upsertBay(bay);
          hub.publish(jobId, { type: "bay", bay: { ...bay } });
        }
      }
    });

    const allFailed = bays.length > 0 && bays.every((bay) => bay.status === "failed");
    job = await store.updateJob(
      jobId,
      allFailed ? { status: "failed", error: "Every bay failed. Open a door for the reason." } : { status: "done" },
    );
    if (job) hub.publish(jobId, { type: "job", job });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("job.fail", { jobId, err: message });
    const job = await store.updateJob(jobId, { status: "failed", error: message });
    if (job) hub.publish(jobId, { type: "job", job });
  }
}
