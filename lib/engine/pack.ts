import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function packLocalTree(): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "forklift-pack-"));
  const out = join(dir, "tree.tgz");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "tar",
      [
        "-czf",
        out,
        "--exclude=node_modules",
        "--exclude=.next",
        "--exclude=data",
        "--exclude=.git",
        "--exclude=.env",
        "--exclude=.env.local",
        "-C",
        process.cwd(),
        ".",
      ],
      { stdio: "ignore" },
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exited ${code}`));
    });
    child.on("error", reject);
  });
  const bytes = await readFile(out);
  await rm(dir, { recursive: true, force: true });
  return bytes;
}

export function isLocalRepo(cloneUrl: string): boolean {
  return cloneUrl === "local://" || cloneUrl.startsWith("local://");
}
