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
  return NextResponse.json({ bay });
}
