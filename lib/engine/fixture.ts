import { detectSolari } from "@/lib/detect/solari";
import { checkReadme, evaluateCriteria } from "@/lib/detect/readme";
import { detectStack } from "@/lib/detect/stack";
import { getHub } from "@/lib/engine/events";
import { getStore } from "@/lib/store";
import type { Bay, Evidence } from "@/lib/types";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function logBay(bay: Bay, line: string) {
  const store = await getStore();
  await store.appendLog(bay.id, line);
  getHub().publish(bay.jobId, { type: "log", jobId: bay.jobId, bayId: bay.id, line });
}

export async function fixtureBay(input: { bay: Bay; criteria: string[] }): Promise<void> {
  const store = await getStore();
  const steps: Array<[Bay["status"], string]> = [
    ["cloning", `clone ${input.bay.repo.cloneUrl}`],
    ["scanning", "secret scan clean"],
    ["installing", "npm install"],
    ["testing", "tests skipped in fixture mode"],
    ["building", input.bay.isSelf ? "next build (fixture)" : "build"],
    ["preview", "preview http://fixture.local"],
    ["recording", "recording browser session"],
  ];

  for (const [status, line] of steps) {
    input.bay.status = status;
    input.bay.updatedAt = Date.now();
    await store.upsertBay(input.bay);
    getHub().publish(input.bay.jobId, { type: "bay", bay: { ...input.bay } });
    await logBay(input.bay, line);
    await sleep(350 + Math.random() * 400);
  }

  const localFiles: Record<string, string> = {};
  if (input.bay.isSelf) {
    const names = ["package.json", "forklift.yaml", "README.md"];
    for (const name of names) {
      try {
        localFiles[name] = await readFile(join(/* turbopackIgnore: true */ process.cwd(), name), "utf8");
      } catch {
        /* missing */
      }
    }
    try {
      localFiles["lib/engine/pipeline.ts"] = await readFile(
        join(/* turbopackIgnore: true */ process.cwd(), "lib/engine/pipeline.ts"),
        "utf8",
      );
    } catch {
      /* ignore */
    }
    try {
      localFiles["lib/engine/browser.ts"] = await readFile(
        join(/* turbopackIgnore: true */ process.cwd(), "lib/engine/browser.ts"),
        "utf8",
      );
    } catch {
      /* ignore */
    }
    try {
      localFiles["lib/solari/clients.ts"] = await readFile(
        join(/* turbopackIgnore: true */ process.cwd(), "lib/solari/clients.ts"),
        "utf8",
      );
    } catch {
      /* ignore */
    }
  }

  const stack = detectStack(localFiles);
  const solari = input.bay.isSelf
    ? detectSolari(localFiles)
    : {
        sandbox: true,
        browser: true,
        desktop: false,
        recording: true,
        packages: ["@solarisdk/sandbox", "@solarisdk/browser"],
        importHits: ["fixture: assumed from contest fork"],
      };

  const evidence: Evidence = {
    stack: stack.stack === "unknown" ? "node" : stack.stack,
    build: { ok: true, exitCode: 0, summary: "fixture install ok" },
    tests: { ran: false, ok: null, summary: "fixture mode does not run guest tests" },
    diff: {
      filesChanged: input.bay.isSelf ? 40 : 12,
      insertions: input.bay.isSelf ? 2200 : 480,
      deletions: 30,
      files: [
        { path: "README.md", status: "M" },
        { path: input.bay.isSelf ? "lib/engine/pipeline.ts" : "examples/app.ts", status: "A" },
      ],
      newTopLevel: input.bay.isSelf ? ["app", "lib", "forklift.yaml"] : ["src"],
    },
    previewUrl: null,
    replayUrl: null,
    consoleErrors: [],
    networkErrors: [],
    solari,
    readme: checkReadme(localFiles["README.md"] ?? "", stack, solari),
    criteria: evaluateCriteria(input.criteria, {
      solari,
      testsOk: null,
      secrets: [],
      preview: false,
    }),
    secretsFound: [],
    manifestUsed: Boolean(stack.manifest) || input.bay.isSelf,
  };

  await store.setEvidence(input.bay.id, evidence, { status: "done", error: null });
  input.bay.status = "done";
  input.bay.evidence = evidence;
  input.bay.updatedAt = Date.now();
  getHub().publish(input.bay.jobId, { type: "bay", bay: { ...input.bay } });
  await logBay(input.bay, input.bay.isSelf ? "FORKLIFT card closed" : "bay closed");
}
