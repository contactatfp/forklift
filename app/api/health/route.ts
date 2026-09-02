import { accessKeyConfigured, writesLocked } from "@/lib/access";
import { hasSolariKey } from "@/lib/solari/clients";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    fixture: !hasSolariKey(),
    accessKey: accessKeyConfigured(),
    writesLocked: writesLocked(),
  });
}
