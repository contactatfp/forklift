import { describe, expect, it } from "vitest";
import { parseDiff, parseDirDiff } from "@/lib/detect/diff";

describe("parseDiff", () => {
  it("reads shortstat numbers and name-status rows", () => {
    const d = parseDiff(" 3 files changed, 120 insertions(+), 4 deletions(-)", [
      "A\texamples/my-agent/index.ts",
      "M\tREADME.md",
      "R100\told.ts\tnew.ts",
    ].join("\n"));
    expect(d.filesChanged).toBe(3);
    expect(d.insertions).toBe(120);
    expect(d.deletions).toBe(4);
    expect(d.files).toEqual([
      { status: "A", path: "examples/my-agent/index.ts" },
      { status: "M", path: "README.md" },
      { status: "R100", path: "new.ts" },
    ]);
    expect(d.newTopLevel).toEqual(["examples"]);
  });

  it("handles an empty diff", () => {
    const d = parseDiff("", "");
    expect(d.filesChanged).toBe(0);
    expect(d.files).toEqual([]);
  });
});

describe("parseDirDiff", () => {
  it("turns diff -rq output into added/modified rows", () => {
    const d = parseDirDiff([
      "Only in /work/submission: forklift.yaml",
      "Files /work/upstream/README.md and /work/submission/README.md differ",
    ].join("\n"));
    expect(d.filesChanged).toBe(2);
    expect(d.files).toEqual([
      { status: "A", path: "forklift.yaml" },
      { status: "M", path: "/work/submission/README.md" },
    ]);
  });
});
