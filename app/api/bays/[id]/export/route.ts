import { startEngine } from "@/lib/engine";
import { getStore } from "@/lib/store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  startEngine();
  const { id } = await context.params;
  const store = await getStore();
  const bay = await store.getBay(id);
  if (!bay) return NextResponse.json({ error: "not found" }, { status: 404 });
  const job = await store.getJob(bay.jobId);
  const png = await store.getScreenshot(id);
  const screenshot = png ? `data:image/png;base64,${Buffer.from(png).toString("base64")}` : null;
  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    note: "Evidence only. Forklift does not rank candidates or recommend a hire.",
    ranking: null,
    hire: null,
    dryRun: Boolean(job?.fixture) || bay.evidence?.measured === false,
    bay,
    screenshot,
  });
}
