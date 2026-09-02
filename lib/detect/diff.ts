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

/**
 * `diff -rq <upstream> <submission>` output for the self bay, where git history
 * isn't available. Paths come back relative to the submission root: "Only in
 * /work/submission/lib: x" is `lib/x`, and a file only in upstream is a removal.
 */
export function parseDirDiff(output: string, roots: { upstream: string; submission: string }): DiffEvidence {
  const rel = (abs: string, root: string) => abs.replace(new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?`), "");
  const files = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const only = /^Only in ([^:]+): (.+)$/.exec(line);
      if (only) {
        const [, dir, name] = only;
        const inSubmission = dir!.startsWith(roots.submission);
        const base = rel(dir!, inSubmission ? roots.submission : roots.upstream);
        return [{ status: inSubmission ? "A" : "D", path: base ? `${base}/${name}` : name! }];
      }
      const differ = /^Files (.+) and (.+) differ$/.exec(line);
      if (differ) {
        const right = differ[2]!.startsWith(roots.submission) ? differ[2]! : differ[1]!;
        return [{ status: "M", path: rel(right, roots.submission) }];
      }
      return [];
    });
  return {
    filesChanged: files.length,
    insertions: 0,
    deletions: 0,
    files: files.slice(0, 80),
    newTopLevel: [...new Set(files.filter((f) => f.status === "A").map((f) => f.path.split("/")[0] ?? f.path))].slice(0, 20),
  };
}
