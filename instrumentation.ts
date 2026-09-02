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
    // The SDK's start() exit promise rejects when a sandbox dies under it. Node's
    // default for an unobserved rejection is to exit, which took the site down
    // mid-review. Log it and keep serving; bays fail on their own paths.
    process.on("unhandledRejection", (reason) => {
      log("unhandledRejection", { err: reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason) });
    });
    startEngine();
  }
}
