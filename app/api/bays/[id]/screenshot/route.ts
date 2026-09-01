import { startEngine } from "@/lib/engine";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  startEngine();
  const { id } = await context.params;
  const store = await getStore();
  const png = await store.getScreenshot(id);
  if (!png) return new Response("no screenshot", { status: 404 });
  return new Response(Buffer.from(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
