import type { Sandbox } from "@solarisdk/sandbox";
import { parseDiff, parseDirDiff } from "@/lib/detect/diff";
import { EMPTY_SOLARI, detectSolari, mergeSolari } from "@/lib/detect/solari";
import { checkReadme, evaluateCriteria } from "@/lib/detect/readme";
import { SECRET_SCAN_SCRIPT } from "@/lib/detect/secrets";
import {
  ENTRY_FILES,
  changedExampleDirs,
  desiredNodeMajor,
  detectStack,
  type DetectedStack,
} from "@/lib/detect/stack";
import { recordPreview } from "@/lib/engine/browser";
import { getHub } from "@/lib/engine/events";
import { isLocalRepo, packLocalTree } from "@/lib/engine/pack";
import { log } from "@/lib/log";
import {
  createReviewSandbox,
  trackSandbox,
  untrackSandbox,
} from "@/lib/solari/clients";
import { getStore } from "@/lib/store";
import type { Bay, DiffEvidence, Evidence, GithubRepo, ScriptRun } from "@/lib/types";

const WORK = "/work/submission";
const DEFAULT_BUDGET_MS = 5 * 60 * 1000;
const MAX_BUDGET_MS = 8 * 60 * 1000;
const SCRIPT_TIMEOUT_MS = 90_000;
const TRANSCRIPT_CHARS = 8_000;

function githubToken(): string | null {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
}

/** Creds for sandbox git over HTTPS — passed per call, never written to the remote URL. */
function gitAuth(): { username?: string; password?: string } {
  const token = githubToken();
  if (!token) return {};
  return { username: "x-access-token", password: token };
}

/**
 * Same creds for raw `git` invocations, as an extraheader in env. Nothing ends
 * up in `.git/config` and a failing fetch can't echo the token in its URL.
 */
function gitEnv(): Record<string, string> {
  const token = githubToken();
  if (!token) return {};
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
    GIT_TERMINAL_PROMPT: "0",
  };
}

/** Belt and braces: if the token shows up in anything we log or stamp, blank it. */
export function scrub(text: string): string {
  const token = githubToken();
  let out = text.replace(/x-access-token:[^@\s]+@/g, "x-access-token:***@");
  if (token) out = out.split(token).join("***");
  return out.replace(/slr_live_[A-Za-z0-9]+/g, "slr_live_***");
}

class Budget {
  constructor(private deadline: number) {}
  remaining() {
    return Math.max(0, this.deadline - Date.now());
  }
  assert() {
    if (this.remaining() <= 0) throw new Error("Review budget exhausted");
  }
  cap(ms: number) {
    this.assert();
    return Math.min(ms, this.remaining());
  }
  /** forklift.yaml may ask for more time; clamp so a guest can't hold a bay forever. */
  extendTo(totalMs: number, startedAt: number) {
    const next = startedAt + Math.min(totalMs, MAX_BUDGET_MS);
    if (next > this.deadline) this.deadline = next;
  }
}

// one writer per bay: appendLog is read-modify-write and npm floods it from onStdout
const logQueues = new Map<string, Promise<void>>();

function logBay(bay: Bay, line: string): Promise<void> {
  const prev = logQueues.get(bay.id) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      const store = await getStore();
      const clean = scrub(line);
      // keep the in-memory bay current so a later upsertBay doesn't wipe the log
      bay.logs = await store.appendLog(bay.id, clean);
      getHub().publish(bay.jobId, { type: "log", jobId: bay.jobId, bayId: bay.id, line: clean });
    });
  logQueues.set(bay.id, next);
  return next;
}

async function setStatus(bay: Bay, status: Bay["status"]) {
  const store = await getStore();
  await logQueues.get(bay.id);
  const next = { ...bay, status, updatedAt: Date.now() };
  await store.upsertBay(next);
  Object.assign(bay, next);
  getHub().publish(bay.jobId, { type: "bay", bay: { ...bay } });
}

async function sh(
  sbx: Sandbox,
  command: string,
  opts: { cwd?: string; timeoutMs: number; env?: Record<string, string>; onLog?: (s: string) => void },
) {
  return sbx.commands.run("sh", {
    args: ["-c", command],
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs,
    env: opts.env,
    onStdout: (d) => opts.onLog?.(d.trimEnd()),
    onStderr: (d) => opts.onLog?.(d.trimEnd()),
  });
}

const MANIFEST_NAMES = [
  "package.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "pyproject.toml",
  "requirements.txt",
  "Pipfile",
  "forklift.yaml",
  "forklift.yml",
  ".nvmrc",
  "README.md",
  "readme.md",
  "next.config.ts",
  "next.config.js",
  "next.config.mjs",
  "main.py",
  "app.py",
  "manage.py",
  ...ENTRY_FILES,
];

/** Read the files detection cares about from `dir`. Keys are relative to `dir`. */
async function readGuestFiles(sbx: Sandbox, dir: string, opts?: { search?: boolean }): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  await Promise.all(
    MANIFEST_NAMES.map(async (name) => {
      try {
        files[name] = await sbx.files.readText(`${dir}/${name}`);
      } catch {
        /* missing */
      }
    }),
  );

  if (opts?.search === false) return files;

  for (const query of ["@solarisdk", "solarisdk", "recording: true"]) {
    try {
      const hits = await sbx.files.search(dir, query, 30);
      for (const hit of hits) {
        const rel = hit.path.replace(`${dir}/`, "");
        if (files[rel]) continue;
        try {
          files[rel] = await sbx.files.readText(hit.path);
        } catch {
          files[rel] = hit.text;
        }
      }
    } catch {
      /* search is best-effort */
    }
  }

  return files;
}

const PREVIEW_WAIT_MS = 150_000;
const LOOPBACK_CHECK_AFTER_MS = 20_000;

/** Does anything answer HTTP on 127.0.0.1:port inside the guest? Any status counts. */
async function listeningOnLoopback(sbx: Sandbox, port: number): Promise<boolean> {
  const probe = await sbx.commands.run("python3", {
    args: [
      "-c",
      `import urllib.request,sys\ntry:\n  urllib.request.urlopen('http://127.0.0.1:${port}/',timeout=3)\n  print('up')\nexcept urllib.error.HTTPError:\n  print('up')\nexcept Exception as e:\n  print('down',e)`,
    ],
    timeoutMs: 8_000,
  });
  return probe.stdout.trim().startsWith("up");
}

/**
 * Vite, CRA and friends bind 127.0.0.1 by default and ignore HOST, so the
 * preview proxy 502s forever. Put a dumb TCP forwarder on 0.0.0.0 in front.
 */
async function forwardLoopback(sbx: Sandbox, port: number, fwd: number): Promise<void> {
  const script = `import socket,threading
def pipe(a,b):
  try:
    while True:
      d=a.recv(65536)
      if not d: break
      b.sendall(d)
  except Exception: pass
  finally:
    try: b.shutdown(socket.SHUT_WR)
    except Exception: pass
def handle(c):
  try: u=socket.create_connection(('127.0.0.1',${port}),timeout=10)
  except Exception:
    c.close(); return
  threading.Thread(target=pipe,args=(c,u),daemon=True).start()
  threading.Thread(target=pipe,args=(u,c),daemon=True).start()
s=socket.socket(); s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
s.bind(('0.0.0.0',${fwd})); s.listen(64)
while True:
  c,_=s.accept(); threading.Thread(target=handle,args=(c,),daemon=True).start()`;
  await sbx.files.write("/tmp/forklift_forward.py", script);
  await sbx.commands.start("python3", { args: ["/tmp/forklift_forward.py"] });
}

type PreviewWait = { up: boolean; url: string; forwarded: boolean };

async function waitForPreview(
  sbx: Sandbox,
  initial: { url: string; port: number },
  health: string,
  budget: Budget,
  onNote: (line: string) => Promise<void>,
): Promise<PreviewWait> {
  const started = Date.now();
  let url = initial.url;
  let forwarded = false;
  const deadline = Math.min(started + PREVIEW_WAIT_MS, started + Math.max(0, budget.remaining() - 60_000));
  while (Date.now() < deadline) {
    try {
      const res = await fetch(new URL(health || "/", url).toString(), { redirect: "follow" });
      if (res.ok) return { up: true, url, forwarded };
    } catch {
      /* not up yet */
    }
    if (!forwarded && Date.now() - started > LOOPBACK_CHECK_AFTER_MS) {
      if (await listeningOnLoopback(sbx, initial.port)) {
        const fwd = initial.port + 1000;
        await onNote(`app answers on 127.0.0.1:${initial.port} only · forwarding 0.0.0.0:${fwd} → it`);
        await forwardLoopback(sbx, initial.port, fwd);
        url = (await sbx.previewUrl(fwd)).url;
        forwarded = true;
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { up: false, url, forwarded };
}

async function readsSolariKey(sbx: Sandbox, dir: string): Promise<boolean> {
  try {
    const hits = await sbx.files.search(dir, "SOLARI_API_KEY", 5);
    return hits.length > 0;
  } catch {
    return false;
  }
}

function tail(text: string, chars: number): string {
  return text.length > chars ? `…${text.slice(-chars)}` : text;
}

const nodeVersionCache = new Map<number, Promise<string | null>>();

/** Latest release of a Node major, from nodejs.org's index. Cached per process. */
function latestNodeFor(major: number): Promise<string | null> {
  const cached = nodeVersionCache.get(major);
  if (cached) return cached;
  const p = (async () => {
    try {
      const res = await fetch("https://nodejs.org/dist/index.json");
      if (!res.ok) return null;
      const list = (await res.json()) as Array<{ version: string; files: string[] }>;
      const hit = list.find((r) => r.version.startsWith(`v${major}.`) && r.files.includes("linux-x64"));
      return hit?.version ?? null;
    } catch {
      return null;
    }
  })();
  nodeVersionCache.set(major, p);
  return p;
}

/**
 * The base image ships Node 18. Playwright — and so @solarisdk/browser — needs
 * 20+, which knocks out most Node forks before they start. Drop the wanted
 * major into /opt/node and put it first on PATH for the rest of the review.
 */
async function ensureNode(
  sbx: Sandbox,
  wantMajor: number,
  budget: Budget,
  note: (line: string) => Promise<void>,
): Promise<Record<string, string>> {
  const have = await sh(sbx, "node -v 2>/dev/null || echo none", { timeoutMs: budget.cap(10_000) });
  const haveMajor = Number(/v(\d+)/.exec(have.stdout)?.[1] ?? 0);
  if (haveMajor >= wantMajor) return {};

  const version = await latestNodeFor(wantMajor);
  if (!version) {
    await note(`node ${wantMajor} wanted but nodejs.org index unavailable; staying on ${have.stdout.trim()}`);
    return {};
  }
  const script = [
    "set -e",
    'a=$(uname -m); case "$a" in x86_64) a=x64;; aarch64|arm64) a=arm64;; esac',
    `curl -fsSL "https://nodejs.org/dist/${version}/node-${version}-linux-$a.tar.xz" -o /tmp/node.tar.xz`,
    "mkdir -p /opt/node && tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1",
    "/opt/node/bin/node -v",
  ].join("\n");
  const got = await sh(sbx, script, { timeoutMs: budget.cap(90_000) });
  if (got.exitCode !== 0) {
    await note(`node ${version} install failed (${got.exitCode}); staying on ${have.stdout.trim()}`);
    return {};
  }
  await note(`node ${have.stdout.trim()} → ${got.stdout.trim()} (guest wants ${wantMajor}.x)`);
  const pathRes = await sh(sbx, "echo $PATH", { timeoutMs: budget.cap(5_000) });
  return { PATH: `/opt/node/bin:${pathRes.stdout.trim() || "/usr/local/bin:/usr/bin:/bin"}` };
}

export async function reviewBay(input: {
  bay: Bay;
  upstream: GithubRepo;
  criteria: string[];
}): Promise<void> {
  const startedAt = Date.now();
  const budget = new Budget(startedAt + DEFAULT_BUDGET_MS);
  const store = await getStore();
  let sbx: Sandbox | null = null;

  const onLog = (chunk: string) => {
    const lines = chunk.split("\n").map((l) => l.trimEnd()).filter(Boolean);
    for (const line of lines.slice(-8)) {
      void logBay(input.bay, line.slice(0, 500));
    }
  };

  try {
    sbx = await createReviewSandbox({ jobId: input.bay.jobId, bayId: input.bay.id });
    trackSandbox(sbx);
    input.bay.sandboxId = sbx.id;
    await store.upsertBay(input.bay);

    await sbx.connect();
    await setStatus(input.bay, "cloning");
    const isLocal = input.bay.isSelf || isLocalRepo(input.bay.repo.cloneUrl);
    if (isLocal) {
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
      const auth = gitAuth();
      try {
        await sbx.git.clone(input.bay.repo.cloneUrl, {
          path: WORK,
          depth: 1,
          branch: input.bay.repo.defaultBranch,
          ...auth,
        });
      } catch {
        await sbx.git.clone(input.bay.repo.cloneUrl, { path: WORK, depth: 1, ...auth });
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

    // diff first — for cookbook forks it tells us which example dir to review
    let diff: DiffEvidence = { filesChanged: 0, insertions: 0, deletions: 0, files: [], newTopLevel: [] };
    if (isLocal) {
      await sbx.git.clone(input.upstream.cloneUrl, {
        path: "/work/upstream",
        depth: 1,
        ...gitAuth(),
      });
      const listed = await sh(
        sbx,
        `diff -rq /work/upstream ${WORK} | grep -v node_modules | grep -v '.git' | head -80`,
        { timeoutMs: budget.cap(20_000) },
      );
      diff = parseDirDiff(listed.stdout);
      await logBay(input.bay, `diff ${diff.filesChanged} paths vs upstream`);
    } else {
      const env = gitEnv();
      await sbx.commands.run("git", {
        args: ["remote", "add", "upstream", input.upstream.cloneUrl],
        cwd: WORK,
        timeoutMs: budget.cap(15_000),
      });
      const fetchUp = await sbx.commands.run("git", {
        args: ["fetch", "upstream", input.upstream.defaultBranch, "--depth", "1"],
        cwd: WORK,
        env,
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
      } else {
        await logBay(input.bay, `upstream fetch failed (${fetchUp.exitCode}); diff unavailable`);
      }
    }

    // detect at the root; if the root is bare and the fork lives in examples/, follow the diff
    const rootFiles = await readGuestFiles(sbx, WORK);
    let stack: DetectedStack = detectStack(rootFiles);
    let solari = detectSolari(rootFiles);
    let files = rootFiles;
    if (stack.stack === "unknown" && !stack.manifest) {
      const candidates = changedExampleDirs(diff.files);
      for (const dir of candidates) {
        const exFiles = await readGuestFiles(sbx, `${WORK}/${dir}`, { search: false });
        const exStack = detectStack(exFiles, { cwd: dir });
        if (exStack.stack === "unknown") continue;
        stack = exStack;
        files = { ...rootFiles, ...exFiles };
        solari = mergeSolari(solari, detectSolari(exFiles));
        await logBay(input.bay, `reviewing ${dir} (changed in this fork)`);
        break;
      }
    }
    if (stack.manifest?.cwd && stack.cwd !== "") {
      const sub = await readGuestFiles(sbx, `${WORK}/${stack.cwd}`, { search: false });
      files = { ...files, ...sub };
      solari = mergeSolari(solari, detectSolari(sub));
    }
    if (stack.manifest?.timeoutMinutes) budget.extendTo(stack.manifest.timeoutMinutes * 60_000, startedAt);

    const readme = checkReadme(files["README.md"] ?? files["readme.md"] ?? "", stack, solari);
    const cwd = stack.cwd ? `${WORK}/${stack.cwd}` : WORK;
    await logBay(
      input.bay,
      `stack ${stack.stack} · ${stack.kind}${stack.cwd ? ` · ${stack.cwd}` : ""}${stack.manifest ? " · forklift.yaml" : ""}`,
    );
    input.bay.mode = stack.kind;
    await store.upsertBay(input.bay);
    getHub().publish(input.bay.jobId, { type: "bay", bay: { ...input.bay } });

    // env every guest command runs with: PATH override once node is swapped, CI so nothing watches
    const guestEnv: Record<string, string> = { CI: "1", NO_COLOR: "1" };
    if (input.bay.isSelf) guestEnv.FORKLIFT_FIXTURE = "1";
    if (stack.stack === "node") {
      await setStatus(input.bay, "installing");
      Object.assign(guestEnv, await ensureNode(sbx, desiredNodeMajor(files), budget, (line) => logBay(input.bay, line)));
    }

    // what the guest actually ran on — half of "works on my machine" is right here
    try {
      const tool = await sh(sbx, "echo node $(node -v 2>/dev/null || echo none) · npm $(npm -v 2>/dev/null || echo none) · $(python3 --version 2>/dev/null || echo 'python none')", {
        timeoutMs: budget.cap(10_000),
        env: guestEnv,
      });
      const line = tool.stdout.trim();
      if (line) await logBay(input.bay, `toolchain ${line}`);
    } catch {
      /* cosmetic */
    }

    let buildOk = true;
    let buildCode: number | null = 0;
    let buildSummary = "no install step";
    if (stack.install) {
      await setStatus(input.bay, "installing");
      await logBay(input.bay, stack.install);
      const install = await sh(sbx, stack.install, {
        cwd,
        timeoutMs: budget.cap(180_000),
        env: guestEnv,
        onLog,
      });
      buildOk = install.exitCode === 0;
      buildCode = install.exitCode;
      buildSummary = buildOk ? "install ok" : scrub((install.stderr || install.stdout).slice(-400));
      if (!buildOk) throw new Error(`install failed: ${buildSummary}`);
    }

    // a manifest that spells out install owns its own build step; only guess for bare repos
    const pkg = files["package.json"] ?? "";
    if (stack.kind === "server" && !stack.manifest?.install && pkg.includes('"next"') && pkg.includes('"build"')) {
      await setStatus(input.bay, "building");
      await logBay(input.bay, "npm run build");
      const built = await sh(sbx, "npm run build", {
        cwd,
        timeoutMs: budget.cap(180_000),
        env: guestEnv,
        onLog,
      });
      buildOk = built.exitCode === 0;
      buildCode = built.exitCode;
      buildSummary = buildOk ? "build ok" : scrub((built.stderr || built.stdout).slice(-400));
      if (!buildOk) throw new Error(`build failed: ${buildSummary}`);
    }

    let testsRan = false;
    let testsOk: boolean | null = null;
    let testSummary = "no tests";
    if (stack.test) {
      await setStatus(input.bay, "testing");
      await logBay(input.bay, stack.test);
      const test = await sh(sbx, stack.test, {
        cwd,
        timeoutMs: budget.cap(90_000),
        env: guestEnv,
        onLog,
      });
      testsRan = true;
      testsOk = test.exitCode === 0;
      testSummary = testsOk ? "tests passed" : scrub((test.stderr || test.stdout).slice(-400));
    }

    let previewUrl: string | null = null;
    let previewUp = false;
    let screenshot: Uint8Array | null = null;
    let replayUrl: string | null = null;
    let consoleErrors: string[] = [];
    let networkErrors: string[] = [];
    let script: ScriptRun | null = null;

    if (!stack.start) {
      await logBay(input.bay, "no start command; nothing to run");
    } else if (stack.kind === "script") {
      // one-shot program: the transcript is the artifact. our key never goes in.
      await setStatus(input.bay, "running");
      const needsKey = await readsSolariKey(sbx, cwd);
      await logBay(input.bay, `${stack.start}${needsKey ? "  (reads SOLARI_API_KEY — not provided)" : ""}`);
      let exitCode: number | null = null;
      let timedOut = false;
      let out = "";
      try {
        const run = await sh(sbx, stack.start, {
          cwd,
          timeoutMs: budget.cap(SCRIPT_TIMEOUT_MS),
          env: guestEnv,
          onLog,
        });
        exitCode = run.exitCode;
        out = `${run.stdout}${run.stderr ? `\n--- stderr ---\n${run.stderr}` : ""}`;
      } catch (err) {
        const msg = String(err);
        timedOut = /timeout|timed out/i.test(msg);
        out = `${out}\n--- forklift ---\n${timedOut ? `no exit after ${SCRIPT_TIMEOUT_MS / 1000}s; killed` : msg}`;
      }
      script = {
        command: stack.start,
        exitCode,
        timedOut,
        needsKey,
        transcript: scrub(tail(out.trim(), TRANSCRIPT_CHARS)),
      };
      await logBay(
        input.bay,
        timedOut ? "script timed out" : `script exit ${exitCode}${needsKey ? " (not judged: needs a key)" : ""}`,
      );
    } else {
      await setStatus(input.bay, "preview");
      await logBay(input.bay, stack.start);
      const env: Record<string, string> = {
        ...guestEnv,
        PORT: String(stack.port),
        HOST: "0.0.0.0",
      };
      // stream the server's own output into the log so a crash on boot is visible on the card
      await sbx.commands.start("sh", {
        args: ["-c", stack.start],
        cwd,
        env,
        onStdout: (d) => onLog(d),
        onStderr: (d) => onLog(d),
      });
      const preview = await sbx.previewUrl(stack.port);
      previewUrl = preview.url;
      await logBay(input.bay, `preview ${previewUrl}`);
      const wait = await waitForPreview(
        sbx,
        { url: preview.url, port: stack.port },
        stack.health,
        budget,
        (line) => logBay(input.bay, line),
      );
      if (wait.forwarded) {
        previewUrl = wait.url;
        await logBay(input.bay, `preview ${previewUrl}`);
      }
      previewUp = wait.up;
      if (!wait.up) {
        await logBay(input.bay, `preview never returned 200 on ${stack.health || "/"} — skipping browser recording`);
      }

      if (wait.up) {
        await setStatus(input.bay, "recording");
        await logBay(input.bay, "recording browser session");
        try {
          const pass = await recordPreview({
            previewUrl: wait.url,
            health: stack.health,
            demo: stack.manifest?.demo ?? [],
          });
          screenshot = pass.screenshot;
          replayUrl = pass.replayUrl;
          consoleErrors = pass.consoleErrors;
          networkErrors = pass.networkErrors;
          if (screenshot) await store.setScreenshot(input.bay.id, screenshot);
          if (!screenshot) await logBay(input.bay, "browser pass finished with no screenshot");
          else if (replayUrl) await logBay(input.bay, "replay ready");
          else await logBay(input.bay, "screenshot saved · replay missing");
        } catch (err) {
          await logBay(input.bay, `browser pass failed: ${String(err)}`);
        }
      }
    }

    const evidence: Evidence = {
      stack: stack.stack,
      measured: true,
      kind: stack.kind,
      cwd: stack.cwd,
      build: { ok: buildOk, exitCode: buildCode, summary: buildSummary },
      tests: { ran: testsRan, ok: testsOk, summary: testSummary },
      script,
      diff,
      previewUrl,
      previewUp,
      replayUrl,
      consoleErrors,
      networkErrors,
      solari: solari ?? EMPTY_SOLARI,
      readme,
      criteria: evaluateCriteria(input.criteria, {
        solari,
        testsOk,
        secrets: secretsFound,
        preview: previewUp,
        script,
        measured: true,
      }),
      secretsFound,
      manifestUsed: Boolean(stack.manifest),
    };

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

    // kill (not pause) so the concurrency slot frees for the next bay in the pool
    try {
      await sbx.kill();
    } catch (err) {
      log("sandbox.kill.fail", { err: String(err) });
    }
    untrackSandbox(sbx);
  } catch (err) {
    const message = scrub(err instanceof Error ? err.message : String(err));
    log("bay.fail", { bay: input.bay.id, err: message });
    try {
      await logBay(input.bay, `FAIL ${message}`);
    } catch {
      /* store may be down */
    }
    input.bay.status = "failed";
    input.bay.error = message;
    try {
      await store.upsertBay(input.bay);
      getHub().publish(input.bay.jobId, { type: "bay", bay: { ...input.bay } });
    } catch {
      /* best effort */
    }
    if (sbx) {
      try {
        await sbx.kill();
      } catch {
        /* gone */
      }
      untrackSandbox(sbx);
    }
  }
}
