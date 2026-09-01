import { startEngine } from "@/lib/engine";
import { getStore } from "@/lib/store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  startEngine();
  const { id } = await context.params;
  const store = await getStore();
  const job = await store.getJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  const bays = await store.listBays(id);
  return NextResponse.json({ job, bays });
}
