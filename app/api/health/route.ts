export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, fixture: process.env.FORKLIFT_FIXTURE === "1" || !process.env.SOLARI_API_KEY });
}
