import yaml from "yaml";
import type { DemoStep, ForkliftManifest, RunKind, StackKind } from "@/lib/types";

export type DetectedStack = {
  stack: StackKind;
  kind: RunKind;
  /** Where install/start run, relative to the repo root. "" is the root. */
  cwd: string;
  install: string | null;
  start: string | null;
  test: string | null;
  port: number;
  /**
   * Hand the app PORT=<port> on start? False when the port is a framework default
   * we merely expect (Vite's 5173): forcing it onto a sibling API server made the
   * two collide on the same socket in a live run.
   */
  portEnv: boolean;
  health: string;
  manifest: ForkliftManifest | null;
};

// anything in here means the repo listens on a port and deserves a browser walk
const NODE_SERVER_DEPS = [
  "next",
  "express",
  "fastify",
  "hono",
  "koa",
  "@hapi/hapi",
  "nest",
  "@nestjs/core",
  "vite",
  "react-scripts",
  "@remix-run/node",
  "astro",
  "nuxt",
  "@sveltejs/kit",
  "gatsby",
  "http-server",
  "serve",
];

/** Entry points worth reading for a `.listen(` — also the list the pipeline fetches from the guest. */
export const ENTRY_FILES = [
  "index.ts",
  "index.js",
  "main.ts",
  "main.js",
  "server.ts",
  "server.js",
  "app.ts",
  "app.js",
  "src/index.ts",
  "src/index.js",
  "src/main.ts",
  "src/server.ts",
  "src/server.js",
  "src/app.ts",
];

function readKind(value: unknown): RunKind | undefined {
  return value === "server" || value === "script" ? value : undefined;
}

function cleanCwd(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/^\.?\//, "").replace(/\/+$/, "");
  // no climbing out of the checkout
  if (!trimmed || trimmed.split("/").some((part) => part === "..")) return undefined;
  return trimmed;
}

type PkgJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: { node?: string };
};

function asPkg(value: unknown): PkgJson | null {
  if (!value || typeof value !== "object") return null;
  return value as PkgJson;
}

export function parseManifest(text: string): ForkliftManifest {
  const parsed: unknown = yaml.parse(text);
  if (!parsed || typeof parsed !== "object") return {};
  const rec = parsed as Record<string, unknown>;
  const stack = rec.stack === "node" || rec.stack === "python" ? rec.stack : undefined;
  const demoRaw = rec.demo;
  const demo: DemoStep[] | undefined = Array.isArray(demoRaw)
    ? demoRaw.flatMap((step): DemoStep[] => {
        if (!step || typeof step !== "object") return [];
        const s = step as Record<string, unknown>;
        if (s.action === "goto" && typeof s.path === "string") return [{ action: "goto", path: s.path }];
        if (s.action === "click") {
          return [{
            action: "click",
            text: typeof s.text === "string" ? s.text : undefined,
            selector: typeof s.selector === "string" ? s.selector : undefined,
          }];
        }
        if (s.action === "wait") {
          return [{
            action: "wait",
            ms: typeof s.ms === "number" ? s.ms : undefined,
            selector: typeof s.selector === "string" ? s.selector : undefined,
            text: typeof s.text === "string" ? s.text : undefined,
            timeoutMs: typeof s.timeoutMs === "number" ? s.timeoutMs : undefined,
          }];
        }
        if (s.action === "screenshot") return [{ action: "screenshot" }];
        return [];
      })
    : undefined;
  return {
    name: typeof rec.name === "string" ? rec.name : undefined,
    stack,
    kind: readKind(rec.kind),
    cwd: cleanCwd(rec.cwd),
    install: typeof rec.install === "string" ? rec.install : undefined,
    start: typeof rec.start === "string" ? rec.start : undefined,
    port: typeof rec.port === "number" ? rec.port : undefined,
    health: typeof rec.health === "string" ? rec.health : undefined,
    tests: typeof rec.tests === "string" ? rec.tests : undefined,
    timeoutMinutes: typeof rec.timeoutMinutes === "number" ? rec.timeoutMinutes : undefined,
    demo,
  };
}

/**
 * Work out how to run what's in `files`. Keys are paths relative to the directory
 * being detected — the repo root, or one `examples/<name>` dir picked from the diff.
 */
export function detectStack(files: Record<string, string>, opts?: { cwd?: string }): DetectedStack {
  const manifest = files["forklift.yaml"]
    ? parseManifest(files["forklift.yaml"])
    : files["forklift.yml"]
      ? parseManifest(files["forklift.yml"])
      : null;

  const pkg = asPkg(files["package.json"] ? jsonParse(files["package.json"]) : null);
  const hasPython =
    Boolean(files["pyproject.toml"]) ||
    Boolean(files["requirements.txt"]) ||
    Boolean(files["Pipfile"]) ||
    Boolean(files["main.py"]);

  let stack: StackKind = "unknown";
  if (manifest?.stack) stack = manifest.stack;
  else if (pkg) stack = "node";
  else if (hasPython) stack = "python";

  let install: string | null = manifest?.install ?? null;
  let start: string | null = manifest?.start ?? null;
  let test: string | null = manifest?.tests ?? null;
  let port = manifest?.port ?? 3000;
  let portEnv = true;
  const health = manifest?.health ?? "/";
  let kind: RunKind = manifest?.kind ?? "server";
  let serverish = Boolean(manifest?.port) || Boolean(manifest?.health);

  if (stack === "node" && pkg) {
    const scripts = pkg.scripts ?? {};
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (!install) {
      if (files["pnpm-lock.yaml"]) install = "pnpm install --frozen-lockfile || pnpm install";
      else if (files["yarn.lock"]) install = "yarn install --frozen-lockfile || yarn install";
      else if (files["package-lock.json"]) install = "npm ci || npm install";
      else install = "npm install";
    }
    if (!start) {
      if (scripts.dev) start = "npm run dev";
      else if (scripts.start) start = "npm run start";
      else if (scripts.preview) start = "npm run preview";
      else if (files["index.ts"] || files["main.ts"]) start = `npx tsx ${files["index.ts"] ? "index.ts" : "main.ts"}`;
      else if (files["index.js"] || files["main.js"]) start = `node ${files["index.js"] ? "index.js" : "main.js"}`;
    }
    // CI=1 in the env keeps jest/vitest out of watch mode; extra args would break node --test
    if (!test && scripts.test) test = "npm test";
    if (!manifest?.port) {
      if (deps?.vite && !deps?.next) {
        port = 5173;
        portEnv = false;
      } else port = 3000;
    }
    const isNext = Boolean(files["next.config.ts"] || files["next.config.js"] || files["next.config.mjs"]);
    if (isNext && scripts.build && scripts.start) {
      start = "npm run start";
    }
    serverish ||= isNext || NODE_SERVER_DEPS.some((name) => Boolean(deps?.[name]));
    // "listen(" in an entry file is the cheapest tell for a bare http/ws server
    const entries = ENTRY_FILES.map((name) => files[name] ?? "").join("\n");
    serverish ||= /\.listen\(|createServer\(|Bun\.serve\(|serve\(\{/.test(entries);
    // `"start": "tsx src/server.ts"` — the applicant told us in the script name
    serverish ||= /\bserver\b/i.test(`${scripts.start ?? ""} ${scripts.dev ?? ""}`);
  }

  if (stack === "python") {
    const req = `${files["requirements.txt"] ?? ""}\n${files["pyproject.toml"] ?? ""}`;
    if (!install) {
      if (files["requirements.txt"]) install = "pip3 install -r requirements.txt";
      else if (files["pyproject.toml"]) install = "pip3 install .";
      else install = null;
    }
    if (!start) {
      if (/fastapi/i.test(req) || files["main.py"]?.includes("FastAPI")) {
        start = "python3 -m uvicorn main:app --host 0.0.0.0 --port 8000";
        port = manifest?.port ?? 8000;
        serverish = true;
      } else if (/flask/i.test(req)) {
        start = "python3 -m flask --app app run --host 0.0.0.0 --port 5000";
        port = manifest?.port ?? 5000;
        serverish = true;
      } else if (/streamlit/i.test(req)) {
        start = "python3 -m streamlit run app.py --server.port 8501 --server.address 0.0.0.0";
        port = manifest?.port ?? 8501;
        serverish = true;
      } else if (files["manage.py"]) {
        start = "python3 manage.py runserver 0.0.0.0:8000";
        port = manifest?.port ?? 8000;
        serverish = true;
      } else if (files["main.py"]) {
        start = "python3 main.py";
      } else if (files["app.py"]) {
        start = "python3 app.py";
      }
    }
    if (!test) {
      if (/pytest/i.test(files["pyproject.toml"] ?? "") || files["requirements.txt"]?.includes("pytest")) {
        test = "python3 -m pytest -q";
      }
    }
  }

  if (!manifest?.kind) kind = serverish ? "server" : "script";

  return {
    stack,
    kind,
    cwd: manifest?.cwd ?? opts?.cwd ?? "",
    install,
    start,
    test,
    port,
    portEnv,
    health,
    manifest,
  };
}

export const DEFAULT_NODE_MAJOR = 22;

/**
 * Which Node major the guest wants. `.nvmrc` or `engines.node` wins when it
 * names one; otherwise current LTS. The Solari base image ships 18, which
 * Playwright (and so @solarisdk/browser) refuses to run on.
 */
export function desiredNodeMajor(files: Record<string, string>): number {
  const nvmrc = files[".nvmrc"]?.trim();
  const fromNvmrc = nvmrc ? /(\d+)/.exec(nvmrc)?.[1] : undefined;
  if (fromNvmrc) return Math.max(18, Number(fromNvmrc));
  const pkg = asPkg(files["package.json"] ? jsonParse(files["package.json"]) : null);
  const engines = pkg?.engines?.node;
  if (engines) {
    // ">=20.9", "^22", "20.x", "18 || 20" → first major named
    const major = /(\d+)/.exec(engines)?.[1];
    if (major) return Math.max(18, Number(major));
  }
  return DEFAULT_NODE_MAJOR;
}

/**
 * Cookbook forks mostly touch `examples/<name>/…`. Given the fork's diff, return
 * the example dirs it added or changed, added ones first, so the pipeline can
 * review the thing the applicant actually wrote instead of an empty repo root.
 */
export function changedExampleDirs(files: Array<{ path: string; status: string }>): string[] {
  const seen = new Map<string, number>();
  for (const f of files) {
    const m = /^(examples\/[^/]+)\//.exec(f.path);
    if (!m?.[1]) continue;
    const dir = m[1];
    const score = f.status.startsWith("A") ? 2 : 1;
    seen.set(dir, Math.max(seen.get(dir) ?? 0, score));
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([dir]) => dir);
}

function jsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
