import { SandboxClient, type Sandbox } from "@solarisdk/sandbox";
import { Solari } from "@solarisdk/browser";
import { log } from "@/lib/log";

const BASE = process.env.SOLARI_BASE_URL ?? "https://api.getsolari.com";

export function hasSolariKey(): boolean {
  return Boolean(process.env.SOLARI_API_KEY) && process.env.FORKLIFT_FIXTURE !== "1";
}

export function sandboxClient(): SandboxClient {
  const apiKey = process.env.SOLARI_API_KEY;
  if (!apiKey) throw new Error("SOLARI_API_KEY is missing");
  return new SandboxClient({ apiKey, baseUrl: BASE });
}

export function browserClient(): Solari {
  const apiKey = process.env.SOLARI_API_KEY;
  if (!apiKey) throw new Error("SOLARI_API_KEY is missing");
  return new Solari({ apiKey, baseUrl: BASE });
}

const live = new Set<Sandbox>();

export function trackSandbox(sbx: Sandbox) {
  live.add(sbx);
}

export function untrackSandbox(sbx: Sandbox) {
  live.delete(sbx);
}

export async function killAllSandboxes() {
  const all = [...live];
  live.clear();
  await Promise.all(
    all.map(async (sbx) => {
      try {
        await sbx.kill();
      } catch (err) {
        log("sandbox.kill.fail", { err: String(err) });
      }
    }),
  );
}

const globalSnap = globalThis as unknown as { forkliftSnap?: Promise<string> };

export function workerSnapshot(): Promise<string> {
  if (!globalSnap.forkliftSnap) {
    globalSnap.forkliftSnap = (async () => {
      const client = sandboxClient();
      const sbx = await client.create({
        template: "base",
        cpu: 2,
        memMb: 4096,
        timeoutMs: 10 * 60 * 1000,
        lifecycle: { onTimeout: "kill" },
      });
      try {
        await sbx.connect();
        await sbx.commands.run("node", { args: ["--version"] });
        await sbx.commands.run("python3", { args: ["--version"] });
        await sbx.commands.run("git", { args: ["--version"] });
        const id = await sbx.snapshot("forklift-worker");
        log("snapshot.ready", { id });
        return id;
      } finally {
        await sbx.kill();
      }
    })();
  }
  return globalSnap.forkliftSnap;
}
