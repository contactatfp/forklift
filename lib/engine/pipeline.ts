import type { Sandbox } from "@solarisdk/sandbox";
import { detectSolari } from "@/lib/detect/solari";
import { checkReadme, evaluateCriteria } from "@/lib/detect/readme";
import { SECRET_SCAN_SCRIPT } from "@/lib/detect/secrets";
import { detectStack } from "@/lib/detect/stack";
import { recordPreview } from "@/lib/engine/browser";
import { getHub } from "@/lib/engine/events";
import { isLocalRepo, packLocalTree } from "@/lib/engine/pack";
import { log } from "@/lib/log";
import {
  sandboxClient,
  trackSandbox,
  untrackSandbox,
  workerSnapshot,
} from "@/lib/solari/clients";
import { getStore } from "@/lib/store";
import type { Bay, DiffEvidence, Evidence, GithubRepo } from "@/lib/types";

const WORK = "/work/submission";
const BUDGET_MS = 5 * 60 * 1000;

class Budget {
  constructor(private deadline: number) {}
  remaining() {
    return Math.max(0, this.deadline - Date.now());
  }
  assert() {
    if (this.remaining() <= 0) throw new Error("Five-minute budget exhausted");
  }
  cap(ms: number) {
    this.assert();
    return Math.min(ms, this.remaining());
  }
}

async function logBay(bay: Bay, line: string) {
  const store = await getStore();
  await store.appendLog(bay.id, line);
  getHub().publish(bay.jobId, { type: "log", jobId: bay.jobId, bayId: bay.id, line });
}

async function setStatus(bay: Bay, status: Bay["status"]) {
  const store = await getStore();
  const next = { ...bay, status, updatedAt: Date.now() };
  await store.upsertBay(next);
  Object.assign(bay, next);
  getHub().publish(bay.jobId, { type: "bay", bay: { ...bay } });
}

async function sh(sbx: Sandbox, command: string, opts: { cwd?: string; timeoutMs: number; env?: Record<string, string>; onLog?: (s: string) => void }) {
  return sbx.commands.run("sh", {
    args: ["-c", command],
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs,
    env: opts.env,
    onStdout: (d) => opts.onLog?.(d.trimEnd()),
    onStderr: (d) => opts.onLog?.(d.trimEnd()),
  });
}

async function readGuestFiles(sbx: Sandbox): Promise<Record<string, string>> {
  const names = [
    "package.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "package-lock.json",
    "pyproject.toml",
    "requirements.txt",
    "Pipfile",
    "forklift.yaml",
    "forklift.yml",
    "README.md",
    "readme.md",
    "next.config.ts",
    "next.config.js",
    "next.config.mjs",
    "main.py",
    "app.py",
    "manage.py",
  ];
  const files: Record<string, string> = {};
  await Promise.all(
    names.map(async (name) => {
      try {
        files[name] = await sbx.files.readText(`${WORK}/${name}`);
      } catch {
        /* missing */
      }
    }),
  );

  try {
    const hits = await sbx.files.search(WORK, "@solarisdk", 30);
    for (const hit of hits) {
      if (files[hit.path]) continue;
      try {
        files[hit.path.replace(`${WORK}/`, "")] = await sbx.files.readText(hit.path);
      } catch {
        files[hit.path] = hit.text;
      }
    }
  } catch {
    /* search optional */
  }

  try {
    const hits = await sbx.files.search(WORK, "recording: true", 20);
    for (const hit of hits) {
      const rel = hit.path.replace(`${WORK}/`, "");
      if (!files[rel]) {
        try {
          files[rel] = await sbx.files.readText(hit.path);
        } catch {
          files[rel] = hit.text;
        }
      }
    }
  } catch {
    /* optional */
  }

  return files;
}

function parseDiff(shortstat: string, nameStatus: string): DiffEvidence {
  const filesChanged = Number(/(\d+) files? changed/.exec(shortstat)?.[1] ?? 0);
  const insertions = Number(/(\d+) insertions?\(\+\)/.exec(shortstat)?.[1] ?? 0);
  const deletions = Number(/(\d+) deletions?\(-\)/.exec(shortstat)?.[1] ?? 0);
  const files = nameStatus
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split(/\s+/);
      return { status: status || "M", path: rest.join(" ") };
    });
  const newTopLevel = [
    ...new Set(
      files
        .filter((f) => f.status.startsWith("A") || f.status === "A")
        .map((f) => f.path.split("/")[0] ?? f.path)
        .filter(Boolean),
    ),
  ].slice(0, 30);
  return { filesChanged, insertions, deletions, files: files.slice(0, 80), newTopLevel };
}

async function waitForPreview(url: string, health: string, budget: Budget): Promise<boolean> {
  const target = new URL(health || "/", url).toString();
  while (budget.remaining() > 15_000) {
    try {
      const res = await fetch(target, { redirect: "follow" });
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

export async function reviewBay(input: {
  bay: Bay;
  upstream: GithubRepo;
  criteria: string[];
}): Promise<void> {
  const budget = new Budget(Date.now() + BUDGET_MS);
  const store = await getStore();
  const client = sandboxClient();
  const snapId = await workerSnapshot();
  const sbx = await client.create({
    fromSnapshot: snapId,
    cpu: 2,
    memMb: 4096,
    timeoutMs: 12 * 60 * 1000,
    lifecycle: { onTimeout: "pause" },
  });
  trackSandbox(sbx);
  input.bay.sandboxId = sbx.id;
  await store.upsertBay(input.bay);

  const onLog = (chunk: string) => {
    const lines = chunk.split("\n").map((l) => l.trimEnd()).filter(Boolean);
    for (const line of lines.slice(-8)) {
      void logBay(input.bay, line.slice(0, 500));
    }
  };

  try {
    await sbx.connect();
    await setStatus(input.bay, "cloning");
    if (isLocalRepo(input.bay.repo.cloneUrl)) {
      await logBay(input.bay, "pack local Forklift tree into sandbox");
      const tgz = await packLocalTree();
      await sbx.files.write("/tmp/forklift.tgz", tgz);
      const unpacked = await sh(sbx, `mkdir -p ${WORK} && tar xzf /tmp/forklift.tgz -C ${WORK}`, {
        timeoutMs: budget.cap(60_000),
        onLog,
      });
      if (unpacked.exitCode !== 0) throw new Error("failed to unpack local tree");
    } else {
      await logBay(input.bay, `clone ${input.bay.repo.cloneUrl}`);
      try {
        await sbx.git.clone(input.bay.repo.cloneUrl, {
          path: WORK,
          depth: 1,
          branch: input.bay.repo.defaultBranch,
        });
      } catch {
        await sbx.git.clone(input.bay.repo.cloneUrl, { path: WORK, depth: 1 });
      }
    }

    await setStatus(input.bay, "scanning");
    await sbx.files.write("/tmp/scan_secrets.py", SECRET_SCAN_SCRIPT);
    const scan = await sbx.commands.run("python3", {
      args: ["/tmp/scan_secrets.py"],
      timeoutMs: budget.cap(30_000),
    });
    let secretsFound: string[] = [];
    try {
      const parsed: unknown = JSON.parse(scan.stdout.trim() || "[]");
      secretsFound = Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      secretsFound = [];
    }
    if (secretsFound.length > 0) {
      throw new Error(`Secrets in submission: ${secretsFound.join("; ")}`);
    }
    await logBay(input.bay, "secret scan clean");

    const files = await readGuestFiles(sbx);
    const stack = detectStack(files);
    const solari = detectSolari(files);
    const readme = checkReadme(files["README.md"] ?? files["readme.md"] ?? "", stack, solari);
    await logBay(input.bay, `stack ${stack.stack}${stack.manifest ? " (forklift.yaml)" : ""}`);

    let diff: DiffEvidence = { filesChanged: 0, insertions: 0, deletions: 0, files: [], newTopLevel: [] };
    if (isLocalRepo(input.bay.repo.cloneUrl)) {
      await sbx.git.clone(input.upstream.cloneUrl, { path: "/work/upstream", depth: 1 });
      const listed = await sh(
        sbx,
        `diff -rq /work/upstream ${WORK} | grep -v node_modules | grep -v '.git' | head -80`,
        { timeoutMs: budget.cap(20_000) },
      );
      const files = listed.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({
          status: line.startsWith("Only in") ? "A" : "M",
          path: line.replace(/^Only in [^:]+:\s*/, "").replace(/^Files .+ and /, ""),
        }));
      diff = {
        filesChanged: files.length,
        insertions: 0,
        deletions: 0,
        files: files.slice(0, 80),
        newTopLevel: [...new Set(files.map((f) => f.path.split("/")[0] ?? f.path))].slice(0, 20),
      };
      await logBay(input.bay, `diff ${diff.filesChanged} paths vs upstream`);
    } else {
      await sbx.commands.run("git", {
        args: ["remote", "add", "upstream", input.upstream.cloneUrl],
        cwd: WORK,
        timeoutMs: budget.cap(15_000),
      });
      const fetchUp = await sbx.commands.run("git", {
        args: ["fetch", "upstream", input.upstream.defaultBranch, "--depth", "1"],
        cwd: WORK,
        timeoutMs: budget.cap(60_000),
      });
      if (fetchUp.exitCode === 0) {
        const stat = await sbx.commands.run("git", {
          args: ["diff", "--shortstat", "FETCH_HEAD"],
          cwd: WORK,
          timeoutMs: budget.cap(15_000),
        });
        const names = await sbx.commands.run("git", {
          args: ["diff", "--name-status", "FETCH_HEAD"],
          cwd: WORK,
          timeoutMs: budget.cap(15_000),
        });
        diff = parseDiff(stat.stdout, names.stdout);
        await logBay(input.bay, `diff ${diff.filesChanged} files +${diff.insertions} -${diff.deletions}`);
      }
    }

    let buildOk = true;
    let buildCode: number | null = 0;
    let buildSummary = "no install step";
    if (stack.install) {
      await setStatus(input.bay, "installing");
      await logBay(input.bay, stack.install);
      const install = await sh(sbx, stack.install, {
        cwd: WORK,
        timeoutMs: budget.cap(180_000),
        onLog,
      });
      buildOk = install.exitCode === 0;
      buildCode = install.exitCode;
      buildSummary = buildOk ? "install ok" : (install.stderr || install.stdout).slice(-400);
      if (!buildOk) throw new Error(`install failed: ${buildSummary}`);
    }

    const pkg = files["package.json"] ?? "";
    if (pkg.includes('"next"') && pkg.includes('"build"')) {
      await setStatus(input.bay, "building");
      await logBay(input.bay, "npm run build");
      const built = await sh(sbx, "npm run build", {
        cwd: WORK,
        timeoutMs: budget.cap(180_000),
        env: input.bay.isSelf ? { FORKLIFT_FIXTURE: "1" } : undefined,
        onLog,
      });
      buildOk = built.exitCode === 0;
      buildCode = built.exitCode;
      buildSummary = buildOk ? "build ok" : (built.stderr || built.stdout).slice(-400);
      if (!buildOk) throw new Error(`build failed: ${buildSummary}`);
    }

    let testsRan = false;
    let testsOk: boolean | null = null;
    let testSummary = "no tests";
    if (stack.test) {
      await setStatus(input.bay, "testing");
      await logBay(input.bay, stack.test);
      const test = await sh(sbx, stack.test, {
        cwd: WORK,
        timeoutMs: budget.cap(90_000),
        onLog,
      });
      testsRan = true;
      testsOk = test.exitCode === 0;
      testSummary = testsOk ? "tests passed" : (test.stderr || test.stdout).slice(-400);
    }

    let previewUrl: string | null = null;
    let screenshot: Uint8Array | null = null;
    let replayUrl: string | null = null;
    let consoleErrors: string[] = [];
    let networkErrors: string[] = [];

    if (stack.start) {
      await setStatus(input.bay, "preview");
      await logBay(input.bay, stack.start);
      const env: Record<string, string> = {
        PORT: String(stack.port),
        HOST: "0.0.0.0",
      };
      if (input.bay.isSelf) env.FORKLIFT_FIXTURE = "1";
      await sbx.commands.start("sh", {
        args: ["-c", stack.start],
        cwd: WORK,
        env,
      });
      const preview = await sbx.previewUrl(stack.port);
      previewUrl = preview.url;
      await logBay(input.bay, `preview ${previewUrl}`);
      const up = await waitForPreview(preview.url, stack.health, budget);
      if (!up) await logBay(input.bay, "preview never returned 200");

      if (up) {
        await setStatus(input.bay, "recording");
        await logBay(input.bay, "recording browser session");
        try {
          const pass = await recordPreview({
            previewUrl: preview.url,
            health: stack.health,
            demo: stack.manifest?.demo ?? [],
          });
          screenshot = pass.screenshot;
          replayUrl = pass.replayUrl;
          consoleErrors = pass.consoleErrors;
          networkErrors = pass.networkErrors;
          if (screenshot) await store.setScreenshot(input.bay.id, screenshot);
          await logBay(input.bay, replayUrl ? "replay ready" : "replay missing");
        } catch (err) {
          await logBay(input.bay, `browser pass failed: ${String(err)}`);
        }
      }
    } else {
      await logBay(input.bay, "no start command, skipping preview");
    }

    const evidence: Evidence = {
      stack: stack.stack,
      build: { ok: buildOk, exitCode: buildCode, summary: buildSummary },
      tests: { ran: testsRan, ok: testsOk, summary: testSummary },
      diff,
      previewUrl,
      replayUrl,
      consoleErrors,
      networkErrors,
      solari,
      readme,
      criteria: evaluateCriteria(input.criteria, {
        solari,
        testsOk,
        secrets: secretsFound,
        preview: Boolean(previewUrl),
      }),
      secretsFound,
      manifestUsed: Boolean(stack.manifest),
    };

    try {
      await sbx.pause();
    } catch (err) {
      log("sandbox.pause.fail", { err: String(err) });
    }

    await store.setEvidence(input.bay.id, evidence, {
      sandboxId: sbx.id,
      error: null,
      status: "done",
    });
    input.bay.status = "done";
    input.bay.evidence = evidence;
    input.bay.hasScreenshot = Boolean(screenshot);
    input.bay.error = null;
    getHub().publish(input.bay.jobId, { type: "bay", bay: { ...input.bay } });
    await logBay(input.bay, "bay closed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("bay.fail", { bay: input.bay.id, err: message });
    await logBay(input.bay, `FAIL ${message}`);
    input.bay.status = "failed";
    input.bay.error = message;
    await store.upsertBay(input.bay);
    getHub().publish(input.bay.jobId, { type: "bay", bay: { ...input.bay } });
    try {
      await sbx.kill();
    } catch {
      /* gone */
    }
    untrackSandbox(sbx);
  }
}
