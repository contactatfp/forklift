import { fixtureBay } from "@/lib/engine/fixture";
import { getHub } from "@/lib/engine/events";
import { reviewBay } from "@/lib/engine/pipeline";
import { listForks, pickReviewSet } from "@/lib/github/forks";
import { parseGithubRepo, sameRepo } from "@/lib/github/parse";
import { newId } from "@/lib/ids";
import { log } from "@/lib/log";
import { hasSolariKey, killAllSandboxes } from "@/lib/solari/clients";
import { getStore } from "@/lib/store";
import type { Bay, CreateJobInput, ForkHit, Job } from "@/lib/types";

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
          : parseGithubRepo(input.selfRepo);
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
      },
      isSelf: Boolean(selfRepo && sameRepo(fork, selfRepo)),
      status: "queued",
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
    await Promise.all(
      bays.map(async (bay) => {
        if (live) await reviewBay({ bay, upstream, criteria: input.criteria });
        else await fixtureBay({ bay, criteria: input.criteria });
      }),
    );

    job = await store.updateJob(jobId, { status: "done" });
    if (job) hub.publish(jobId, { type: "job", job });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("job.fail", { jobId, err: message });
    const job = await store.updateJob(jobId, { status: "failed", error: message });
    if (job) hub.publish(jobId, { type: "job", job });
  }
}
