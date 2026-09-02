import { startEngine } from "@/lib/engine";
import { fetchReplayUrl } from "@/lib/engine/browser";
import { REPLAY_LIMIT, REPLAY_WINDOW_MS, takeToken } from "@/lib/rate-limit";
import { hasSolariKey } from "@/lib/solari/clients";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Presigned replay URLs expire and the replay itself can publish a minute
 * after the session closes, so the card never links the stored URL directly:
 * it comes here and gets a fresh one from the session id.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const retry = takeToken(request, "replay", REPLAY_LIMIT, REPLAY_WINDOW_MS);
  if (retry !== null) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(retry) },
    });
  }
  startEngine();
  const { id } = await context.params;
  const store = await getStore();
  const bay = await store.getBay(id);
  const sessionId = bay?.evidence?.browserSessionId;
  if (!bay || !sessionId) return new Response("no recorded browser session for this bay", { status: 404 });
  if (!hasSolariKey()) return new Response("this deployment has no Solari key, so it cannot mint replay URLs", { status: 503 });

  const url = await fetchReplayUrl(sessionId, 8_000);
  if (!url) {
    return new Response(
      `Solari has not published a replay for session ${sessionId} yet. Reload in a minute; if it never appears, the recording was empty.`,
      { status: 404, headers: { "Content-Type": "text/plain" } },
    );
  }
  return Response.redirect(url, 302);
}
