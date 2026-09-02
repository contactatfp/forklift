import { gunzipSync } from "node:zlib";
import { startEngine } from "@/lib/engine";
import { browserClient, hasSolariKey } from "@/lib/solari/clients";
import { getStore } from "@/lib/store";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * The replay Solari publishes is a gzipped NDJSON of rrweb events, which a
 * browser cannot open. Pull it server-side and hand the player a JSON array.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  startEngine();
  const { id } = await context.params;
  const store = await getStore();
  const bay = await store.getBay(id);
  const sessionId = bay?.evidence?.browserSessionId;
  if (!bay || !sessionId) return Response.json({ error: "no recorded browser session for this bay" }, { status: 404 });
  if (!hasSolariKey()) return Response.json({ error: "this deployment has no Solari key" }, { status: 503 });

  const client = browserClient();
  try {
    let bytes = Buffer.from(await client.sessions.downloadReplay(sessionId));
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
    const events: unknown[] = [];
    for (const line of bytes.toString("utf8").split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        events.push(JSON.parse(t));
      } catch {
        /* a torn last line is not worth failing the tape over */
      }
    }
    return Response.json(
      { sessionId, events },
      { headers: { "Cache-Control": "private, max-age=600" } },
    );
  } catch (err) {
    log("replay.download.fail", { sessionId, err: String(err) });
    return Response.json(
      { error: `Solari has not published a replay for session ${sessionId} yet.`, sessionId },
      { status: 404 },
    );
  } finally {
    await client.close().catch(() => undefined);
  }
}
