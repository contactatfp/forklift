import { getHub } from "@/lib/engine/events";
import { startEngine } from "@/lib/engine";
import { getStore } from "@/lib/store";
import type { EngineEvent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  startEngine();
  const { id } = await context.params;
  const store = await getStore();
  const job = await store.getJob(id);
  if (!job) return new Response("not found", { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: EngineEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      send({ type: "job", job });
      const bays = await store.listBays(id);
      for (const bay of bays) send({ type: "bay", bay });

      const unsub = getHub().subscribe(id, send);
      const timer = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
        send({ type: "heartbeat" });
      }, 15_000);

      const close = () => {
        clearInterval(timer);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
