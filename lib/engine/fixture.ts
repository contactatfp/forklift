import { EMPTY_SOLARI, detectSolari } from "@/lib/detect/solari";
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

/**
 * Dry run: no Solari key, so no sandbox, no clone, no build, no browser.
 * Everything on the card is either real (fork name, GitHub ahead-by count, this
 * app's own source) or explicitly marked not measured. Nothing is invented.
 */
export async function fixtureBay(input: { bay: Bay; criteria: string[] }): Promise<void> {
  const store = await getStore();
  const steps: Array<[Bay["status"], string]> = [
    ["cloning", "dry run · no sandbox, nothing cloned"],
    ["scanning", "dry run · secret scan not run"],
    ["installing", "dry run · install not run"],
    ["building", "dry run · build not run"],
    ["preview", "dry run · no preview"],
    ["recording", "dry run · no recording"],
  ];

  for (const [status, line] of steps) {
    input.bay.status = status;
    input.bay.updatedAt = Date.now();
    await store.upsertBay(input.bay);
    getHub().publish(input.bay.jobId, { type: "bay", bay: { ...input.bay } });
    await logBay(input.bay, line);
    await sleep(150 + Math.random() * 200);
  }

  // self bay: the only thing we can read for real is this app's own tree
  const localFiles: Record<string, string> = {};
  if (input.bay.isSelf) {
    const names = [
      "package.json",
      "forklift.yaml",
      "README.md",
      "lib/engine/pipeline.ts",
      "lib/engine/browser.ts",
      "lib/solari/clients.ts",
    ];
    for (const name of names) {
      try {
        localFiles[name] = await readFile(join(/* turbopackIgnore: true */ process.cwd(), name), "utf8");
      } catch {
        /* missing */
      }
    }
  }

  const stack = detectStack(localFiles);
  const solari = input.bay.isSelf
    ? detectSolari(localFiles)
    : { ...EMPTY_SOLARI, importHits: ["dry run · source not scanned"] };

  const ahead = input.bay.repo.aheadBy ?? null;
  const changed = input.bay.repo.changedFiles ?? null;

  const evidence: Evidence = {
    stack: input.bay.isSelf ? stack.stack : "unknown",
    measured: false,
    kind: input.bay.isSelf ? stack.kind : undefined,
    build: { ok: false, exitCode: null, summary: "dry run · not measured" },
    tests: { ran: false, ok: null, summary: "dry run · not measured" },
    script: null,
    diff: {
      // straight from the GitHub compare API — real, but only a count
      filesChanged: changed ?? 0,
      insertions: 0,
      deletions: 0,
      files: [],
      newTopLevel: [],
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
      measured: false,
    }),
    secretsFound: [],
    manifestUsed: Boolean(stack.manifest),
  };

  await store.setEvidence(input.bay.id, evidence, { status: "done", error: null });
  input.bay.status = "done";
  input.bay.evidence = evidence;
  input.bay.mode = evidence.kind ?? null;
  input.bay.updatedAt = Date.now();
  await store.upsertBay(input.bay);
  getHub().publish(input.bay.jobId, { type: "bay", bay: { ...input.bay } });
  await logBay(
    input.bay,
    ahead === null
      ? "dry run closed · nothing measured"
      : `dry run closed · GitHub says ${ahead} commit${ahead === 1 ? "" : "s"} ahead, ${changed ?? "?"} files changed`,
  );
}
