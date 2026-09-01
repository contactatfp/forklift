import { accessKeyOk, deny } from "@/lib/access";
import { enqueueJob, startEngine } from "@/lib/engine";
import { parseCriteria } from "@/lib/github/parse";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_CRITERIA = [
  "Uses Solari sandboxes as infrastructure",
  "Uses Solari browser recording",
  "Ships a real product, not a tutorial clone",
  "No secrets in the submitted code",
];

export async function POST(request: Request) {
  startEngine();
  const body: unknown = await request.json();
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
  const selfRepo =
    rec.includeSelf === false
      ? "skip"
      : typeof rec.selfRepo === "string" && rec.selfRepo.trim()
        ? rec.selfRepo.trim()
        : "local";
  const verifyUrl = typeof rec.verifyUrl === "string" ? rec.verifyUrl.trim() : undefined;

  if (kind === "verify" && !verifyUrl) {
    return NextResponse.json({ error: "verifyUrl required" }, { status: 400 });
  }

  const job = await enqueueJob({
    kind,
    upstream,
    criteria,
    selfRepo: selfRepo === "skip" ? "none" : selfRepo,
    verifyUrl,
  });
  return NextResponse.json({ job });
}
