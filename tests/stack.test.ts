import { describe, expect, it } from "vitest";
import { changedExampleDirs, desiredNodeMajor, detectStack, parseManifest } from "@/lib/detect/stack";

describe("detectStack", () => {
  it("treats a cookbook-style tsx script as a script, not a server", () => {
    const stack = detectStack({
      "package.json": JSON.stringify({
        scripts: { start: "tsx index.ts" },
        dependencies: { "@solarisdk/browser": "^0.1.2" },
      }),
      "index.ts": 'import { Solari } from "@solarisdk/browser";\nconsole.log("hi");',
    });
    expect(stack.stack).toBe("node");
    expect(stack.kind).toBe("script");
    expect(stack.start).toBe("npm run start");
    expect(stack.install).toBe("npm install");
  });

  it("bootstraps pnpm/yarn through corepack when the lockfile asks for them", () => {
    const pnpm = detectStack({ "package.json": "{}", "pnpm-lock.yaml": "lockfileVersion: 9" });
    expect(pnpm.install).toMatch(/corepack enable/);
    expect(pnpm.install).toMatch(/pnpm install --frozen-lockfile/);
    const yarn = detectStack({ "package.json": "{}", "yarn.lock": "# yarn lockfile v1" });
    expect(yarn.install).toMatch(/corepack enable/);
    expect(yarn.install).toMatch(/yarn install/);
  });

  it("runs a packaged python CLI via its console script or python -m", () => {
    const viaScript = detectStack({
      "pyproject.toml": '[project]\nname = "cubicle"\n\n[project.scripts]\ncubicle = "cubicle.cli:main"\n\n[tool.x]\ny = 1\n',
      "cubicle/__main__.py": "",
    });
    expect(viaScript.install).toBe("pip3 install .");
    expect(viaScript.start).toBe("cubicle");
    expect(viaScript.kind).toBe("script");
    const viaMain = detectStack({ "requirements.txt": "httpx\n", "cubicle/__main__.py": "" });
    expect(viaMain.start).toBe("python3 -m cubicle");
  });

  it("picks the Node major the guest asks for, else current LTS", () => {
    expect(desiredNodeMajor({})).toBe(22);
    expect(desiredNodeMajor({ ".nvmrc": "20.11.0\n" })).toBe(20);
    expect(desiredNodeMajor({ "package.json": JSON.stringify({ engines: { node: ">=18" } }) })).toBe(18);
    expect(desiredNodeMajor({ "package.json": JSON.stringify({ engines: { node: "^24.0.0" } }) })).toBe(24);
  });

  it("spots a bare http server by its start script name or a listen() call", () => {
    const byName = detectStack({
      "package.json": JSON.stringify({ scripts: { start: "tsx src/server.ts" }, dependencies: { openai: "4" } }),
    });
    expect(byName.kind).toBe("server");
    const byListen = detectStack({
      "package.json": JSON.stringify({ scripts: { start: "node src/index.js" } }),
      "src/index.js": "require('http').createServer(h).listen(process.env.PORT)",
    });
    expect(byListen.kind).toBe("server");
    expect(byListen.port).toBe(3000);
  });

  it("calls a Next app a server on port 3000 with build+start", () => {
    const stack = detectStack({
      "package.json": JSON.stringify({
        scripts: { dev: "next dev", build: "next build", start: "next start" },
        dependencies: { next: "16.0.0" },
      }),
      "package-lock.json": "{}",
      "next.config.ts": "export default {}",
    });
    expect(stack.kind).toBe("server");
    expect(stack.port).toBe(3000);
    expect(stack.start).toBe("npm run start");
    expect(stack.install).toBe("npm ci || npm install");
  });

  it("picks 5173 for a vite app", () => {
    const stack = detectStack({
      "package.json": JSON.stringify({ scripts: { dev: "vite" }, devDependencies: { vite: "5" } }),
    });
    expect(stack.kind).toBe("server");
    expect(stack.port).toBe(5173);
  });

  it("runs a bare python main.py as a script", () => {
    const stack = detectStack({
      "requirements.txt": "solari\n",
      "main.py": "print('x')",
    });
    expect(stack.stack).toBe("python");
    expect(stack.kind).toBe("script");
    expect(stack.start).toBe("python3 main.py");
    expect(stack.install).toBe("pip3 install -r requirements.txt");
  });

  it("recognises FastAPI as a server on 8000", () => {
    const stack = detectStack({
      "requirements.txt": "fastapi\nuvicorn\n",
      "main.py": "from fastapi import FastAPI\napp = FastAPI()",
    });
    expect(stack.kind).toBe("server");
    expect(stack.port).toBe(8000);
  });

  it("lets forklift.yaml win over guesses", () => {
    const stack = detectStack({
      "forklift.yaml": [
        "stack: node",
        "kind: server",
        "cwd: forklift",
        "install: cd forklift && npm ci && npm run build",
        "start: cd forklift && npm run start",
        "port: 3000",
        "health: /api/health",
        "timeoutMinutes: 7",
      ].join("\n"),
    });
    expect(stack.manifest?.timeoutMinutes).toBe(7);
    expect(stack.kind).toBe("server");
    expect(stack.cwd).toBe("forklift");
    expect(stack.start).toBe("cd forklift && npm run start");
    expect(stack.health).toBe("/api/health");
  });

  it("returns unknown for an empty root so the pipeline follows the diff", () => {
    const stack = detectStack({ "README.md": "# cookbook" });
    expect(stack.stack).toBe("unknown");
    expect(stack.start).toBeNull();
  });
});

describe("parseManifest", () => {
  it("drops unknown demo steps and climbing cwd values", () => {
    const m = parseManifest(["cwd: ../evil", "demo:", "  - action: goto", "    path: /", "  - action: dance"].join("\n"));
    expect(m.cwd).toBeUndefined();
    expect(m.demo).toEqual([{ action: "goto", path: "/" }]);
  });
});

describe("changedExampleDirs", () => {
  it("returns added example dirs before modified ones, deduplicated", () => {
    const dirs = changedExampleDirs([
      { status: "M", path: "examples/browser-quickstart-ts/index.ts" },
      { status: "A", path: "examples/my-agent/index.ts" },
      { status: "A", path: "examples/my-agent/package.json" },
      { status: "M", path: "README.md" },
    ]);
    expect(dirs).toEqual(["examples/my-agent", "examples/browser-quickstart-ts"]);
  });

  it("finds a project that lives outside examples/ by its manifest", () => {
    const dirs = changedExampleDirs([
      { status: "A", path: "fleet/package.json" },
      { status: "A", path: "fleet/apps/web/package.json" },
      { status: "A", path: "fleet/apps/web/src/index.ts" },
      { status: "A", path: "fleet/packages/core/package.json" },
      { status: "A", path: "fleet/docs/README.md" },
      { status: "A", path: "tools/forklift.yaml" },
      { status: "M", path: "README.md" },
      { status: "M", path: "package.json" },
    ]);
    expect(dirs).toEqual(["fleet", "tools"]);
  });
});
