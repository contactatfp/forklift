import { describe, expect, it } from "vitest";
import { EMPTY_SOLARI, detectSolari, mergeSolari } from "@/lib/detect/solari";

describe("detectSolari", () => {
  it("flags sandbox + browser + recording from imports and options", () => {
    const d = detectSolari({
      "package.json": JSON.stringify({
        dependencies: { "@solarisdk/sandbox": "^0.1.2", "@solarisdk/browser": "^0.1.2" },
      }),
      "lib/run.ts": 'import { SandboxClient } from "@solarisdk/sandbox";\nconst b = await solari.launch({ recording: true });',
    });
    expect(d.sandbox).toBe(true);
    expect(d.browser).toBe(true);
    expect(d.recording).toBe(true);
    expect(d.desktop).toBe(false);
    expect(d.packages).toContain("@solarisdk/sandbox");
  });

  it("stays quiet on a repo that only mentions solari in prose", () => {
    const d = detectSolari({ "README.md": "We love Solari." });
    expect(d).toEqual({ ...EMPTY_SOLARI, importHits: [] });
  });

  it("merges two detections with OR", () => {
    const a = { ...EMPTY_SOLARI, sandbox: true, packages: ["@solarisdk/sandbox"], importHits: ["a: sandbox"] };
    const b = { ...EMPTY_SOLARI, browser: true, packages: ["@solarisdk/browser"], importHits: ["b: browser"] };
    const m = mergeSolari(a, b);
    expect(m.sandbox && m.browser).toBe(true);
    expect(m.packages).toEqual(["@solarisdk/sandbox", "@solarisdk/browser"]);
  });
});
