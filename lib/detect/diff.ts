import type { DiffEvidence } from "@/lib/types";

/** Turn `git diff --shortstat` + `git diff --name-status` output into evidence. */
export function parseDiff(shortstat: string, nameStatus: string): DiffEvidence {
  const filesChanged = Number(/(\d+) files? changed/.exec(shortstat)?.[1] ?? 0);
  const insertions = Number(/(\d+) insertions?\(\+\)/.exec(shortstat)?.[1] ?? 0);
  const deletions = Number(/(\d+) deletions?\(-\)/.exec(shortstat)?.[1] ?? 0);
  const files = nameStatus
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split(/\s+/);
      // renames come through as "R100 old new" — keep the new path
      const path = status?.startsWith("R") && rest.length > 1 ? rest[rest.length - 1] ?? "" : rest.join(" ");
      return { status: status || "M", path };
    });
  const newTopLevel = [
    ...new Set(
      files
        .filter((f) => f.status.startsWith("A"))
        .map((f) => f.path.split("/")[0] ?? f.path)
        .filter(Boolean),
    ),
  ].slice(0, 30);
  return { filesChanged, insertions, deletions, files: files.slice(0, 80), newTopLevel };
}

/** `diff -rq a b` output for the self bay, where git history isn't available. */
export function parseDirDiff(output: string): DiffEvidence {
  const files = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      status: line.startsWith("Only in") ? "A" : "M",
      path: line.replace(/^Only in [^:]+:\s*/, "").replace(/^Files .+ and /, "").replace(/ differ$/, ""),
    }));
  return {
    filesChanged: files.length,
    insertions: 0,
    deletions: 0,
    files: files.slice(0, 80),
    newTopLevel: [...new Set(files.map((f) => f.path.split("/")[0] ?? f.path))].slice(0, 20),
  };
}
