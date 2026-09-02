import { describe, expect, it } from "vitest";
import { evaluateCriteria } from "@/lib/detect/readme";
import { EMPTY_SOLARI } from "@/lib/detect/solari";

const LINES = [
  "Uses Solari sandboxes as infrastructure",
  "Uses Solari browser recording",
  "Ships a real product, not a tutorial clone",
  "No secrets in the submitted code",
  "Runs to completion",
];

describe("evaluateCriteria", () => {
  it("marks every line LOOK on a dry run instead of inventing a NO", () => {
    const out = evaluateCriteria(LINES, {
      solari: EMPTY_SOLARI,
      testsOk: null,
      secrets: [],
      preview: false,
      measured: false,
    });
    expect(out.every((c) => c.kind === "manual")).toBe(true);
    expect(out[0]?.note).toMatch(/dry run/i);
  });

  it("scores sandbox/recording/secrets automatically when measured", () => {
    const out = evaluateCriteria(LINES, {
      solari: { ...EMPTY_SOLARI, sandbox: true, recording: true },
      testsOk: null,
      secrets: [],
      preview: true,
      measured: true,
    });
    expect(out[0]).toMatchObject({ kind: "auto", met: true });
    expect(out[1]).toMatchObject({ kind: "auto", met: true });
    expect(out[2]).toMatchObject({ kind: "manual", inspect: "screenshot", note: "Open the screenshot." });
    expect(out[3]).toMatchObject({ kind: "auto", met: true });
  });

  it("does not judge a script that needs a Solari key we refused to hand over", () => {
    const out = evaluateCriteria(LINES, {
      solari: EMPTY_SOLARI,
      testsOk: null,
      secrets: [],
      preview: false,
      measured: true,
      script: { command: "npm start", exitCode: 1, timedOut: false, needsKey: true, transcript: "" },
    });
    const run = out[4];
    expect(run?.kind).toBe("manual");
    expect(run?.note).toMatch(/not judged/i);
  });

  it("passes a script that exits 0", () => {
    const out = evaluateCriteria(["Runs to completion"], {
      solari: EMPTY_SOLARI,
      testsOk: null,
      secrets: [],
      preview: false,
      measured: true,
      script: { command: "python3 main.py", exitCode: 0, timedOut: false, needsKey: false, transcript: "ok" },
    });
    expect(out[0]).toMatchObject({ kind: "auto", met: true });
  });
});
