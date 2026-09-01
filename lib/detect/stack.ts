import yaml from "yaml";
import type { DemoStep, ForkliftManifest, StackKind } from "@/lib/types";

export type DetectedStack = {
  stack: StackKind;
  install: string | null;
  start: string | null;
  test: string | null;
  port: number;
  health: string;
  manifest: ForkliftManifest | null;
};

type PkgJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
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
    install: typeof rec.install === "string" ? rec.install : undefined,
    start: typeof rec.start === "string" ? rec.start : undefined,
    port: typeof rec.port === "number" ? rec.port : undefined,
    health: typeof rec.health === "string" ? rec.health : undefined,
    tests: typeof rec.tests === "string" ? rec.tests : undefined,
    timeoutMinutes: typeof rec.timeoutMinutes === "number" ? rec.timeoutMinutes : undefined,
    demo,
  };
}

export function detectStack(files: Record<string, string>): DetectedStack {
  const manifest = files["forklift.yaml"]
    ? parseManifest(files["forklift.yaml"])
    : files["forklift.yml"]
      ? parseManifest(files["forklift.yml"])
      : null;

  const pkg = asPkg(files["package.json"] ? jsonParse(files["package.json"]) : null);
  const hasPython =
    Boolean(files["pyproject.toml"]) ||
    Boolean(files["requirements.txt"]) ||
    Boolean(files["Pipfile"]);

  let stack: StackKind = "unknown";
  if (manifest?.stack) stack = manifest.stack;
  else if (pkg) stack = "node";
  else if (hasPython) stack = "python";

  let install: string | null = manifest?.install ?? null;
  let start: string | null = manifest?.start ?? null;
  let test: string | null = manifest?.tests ?? null;
  let port = manifest?.port ?? 3000;
  const health = manifest?.health ?? "/";

  if (stack === "node" && pkg) {
    if (!install) {
      if (files["pnpm-lock.yaml"]) install = "pnpm install --frozen-lockfile || pnpm install";
      else if (files["yarn.lock"]) install = "yarn install --frozen-lockfile || yarn install";
      else if (files["package-lock.json"]) install = "npm ci || npm install";
      else install = "npm install";
    }
    if (!start) {
      const scripts = pkg.scripts ?? {};
      if (scripts.dev) start = "npm run dev";
      else if (scripts.start) start = "npm run start";
      else if (scripts.preview) start = "npm run preview";
    }
    if (!test && pkg.scripts?.test) test = "npm test -- --watchAll=false";
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (!manifest?.port) {
      if (deps?.vite && !deps?.next) port = 5173;
      else port = 3000;
    }
    const isNext = Boolean(files["next.config.ts"] || files["next.config.js"] || files["next.config.mjs"]);
    if (isNext && pkg.scripts?.build && pkg.scripts?.start) {
      start = "npm run start";
    }
  }

  if (stack === "python") {
    if (!install) {
      if (files["requirements.txt"]) install = "pip3 install -r requirements.txt";
      else if (files["pyproject.toml"]) install = "pip3 install .";
      else install = "pip3 install -r requirements.txt";
    }
    if (!start) {
      const req = `${files["requirements.txt"] ?? ""}\n${files["pyproject.toml"] ?? ""}`;
      if (/fastapi/i.test(req) || files["main.py"]?.includes("FastAPI")) {
        start = "python3 -m uvicorn main:app --host 0.0.0.0 --port 8000";
        port = manifest?.port ?? 8000;
      } else if (/flask/i.test(req)) {
        start = "python3 -m flask --app app run --host 0.0.0.0 --port 5000";
        port = manifest?.port ?? 5000;
      } else if (/streamlit/i.test(req)) {
        start = "python3 -m streamlit run app.py --server.port 8501 --server.address 0.0.0.0";
        port = manifest?.port ?? 8501;
      } else if (files["manage.py"]) {
        start = "python3 manage.py runserver 0.0.0.0:8000";
        port = manifest?.port ?? 8000;
      }
    }
    if (!test) {
      if (/pytest/i.test(files["pyproject.toml"] ?? "") || files["requirements.txt"]?.includes("pytest")) {
        test = "python3 -m pytest -q";
      }
    }
  }

  return {
    stack,
    install,
    start,
    test,
    port,
    health,
    manifest,
  };
}

function jsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
