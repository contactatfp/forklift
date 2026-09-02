import { accessKeyOk, deny } from "@/lib/access";
import { enqueueJob, startEngine } from "@/lib/engine";
import { parseCriteria } from "@/lib/github/parse";
import { log } from "@/lib/log";
import { getStore } from "@/lib/store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_CRITERIA = [
  "Uses Solari sandboxes as infrastructure",
  "Uses Solari browser recording",
  "Ships a real product, not a tutorial clone",
  "No secrets in the submitted code",
];

export async function GET(request: Request) {
  if (!accessKeyOk(request)) return deny();
  try {
    const store = await getStore();
    const jobs = await store.listJobs(10);
    return NextResponse.json({
      jobs: jobs.map((job) => ({
        id: job.id,
        kind: job.kind,
        status: job.status,
        upstream: job.upstream,
        forkCount: job.forkCount,
        fixture: job.fixture,
        createdAt: job.createdAt,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("jobs.list.fail", { err: message });
    return NextResponse.json({ error: message || "Failed to list jobs" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  startEngine();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }
  const rec = body as Record<string, unknown>;
  if (!accessKeyOk(request, rec.accessKey)) return deny();

  const kind = rec.kind === "verify" ? "verify" : "contest";
  const upstream =
    typeof rec.upstream === "string" && rec.upstream.trim()
      ? rec.upstream.trim()
      : "https://github.com/solari-sdk/solari-cookbook";
  const criteria =
    typeof rec.criteria === "string" && rec.criteria.trim()
      ? parseCriteria(rec.criteria)
      : DEFAULT_CRITERIA;
  const rawSelf =
    rec.includeSelf === false
      ? "skip"
      : typeof rec.selfRepo === "string" && rec.selfRepo.trim()
        ? rec.selfRepo.trim()
        : "local";
  // blank/local on the slip → optional FORKLIFT_SELF_REPO override (GitHub label)
  const selfRepo =
    rawSelf === "skip"
      ? "skip"
      : rawSelf === "local" || rawSelf === "."
        ? process.env.FORKLIFT_SELF_REPO?.trim() || "local"
        : rawSelf;
  const verifyUrl = typeof rec.verifyUrl === "string" ? rec.verifyUrl.trim() : undefined;

  if (kind === "verify" && !verifyUrl) {
    return NextResponse.json({ error: "verifyUrl required" }, { status: 400 });
  }

  try {
    const job = await enqueueJob({
      kind,
      upstream,
      criteria,
      selfRepo: selfRepo === "skip" ? "none" : selfRepo,
      verifyUrl,
    });
    return NextResponse.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("jobs.create.fail", { err: message });
    return NextResponse.json({ error: message || "Failed to create job" }, { status: 500 });
  }
}
