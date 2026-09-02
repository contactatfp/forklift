export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startEngine } = await import("@/lib/engine/index");
    const { writesLocked } = await import("@/lib/access");
    const { log } = await import("@/lib/log");
    if (writesLocked()) {
      log("access.locked", {
        why: "NODE_ENV=production without FORKLIFT_ACCESS_KEY. POST /api/jobs returns 503 until you set one.",
      });
    }
    startEngine();
  }
}
