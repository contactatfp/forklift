import { accessKeyOk, deny } from "@/lib/access";
import { startEngine } from "@/lib/engine";
import { log } from "@/lib/log";
import { sandboxClient } from "@/lib/solari/clients";
import { getStore } from "@/lib/store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  startEngine();
  if (!accessKeyOk(request)) return deny();
  const { id } = await context.params;
  const store = await getStore();
  const bay = await store.getBay(id);
  if (!bay?.sandboxId) {
    return NextResponse.json({ error: "No sandbox to resume" }, { status: 404 });
  }
  if (bay.evidence?.previewUrl) {
    try {
      const client = sandboxClient();
      const sbx = await client.connect(bay.sandboxId);
      try {
        await sbx.resume();
      } catch (err) {
        log("preview.resume", { err: String(err) });
      }
    } catch (err) {
      log("preview.connect", { err: String(err) });
    }
    return NextResponse.json({ url: bay.evidence.previewUrl });
  }
  return NextResponse.json({ error: "No preview URL" }, { status: 404 });
}
