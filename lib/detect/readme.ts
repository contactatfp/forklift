import type { DetectedStack } from "@/lib/detect/stack";
import type { ReadmeCheck, ScriptRun, SolariDetection } from "@/lib/types";

export function checkReadme(readme: string, stack: DetectedStack, solari: SolariDetection): ReadmeCheck {
  const startMatch = readme.match(/`((?:npm|pnpm|yarn|pip|python|uvicorn|flask)[^`]+)`/);
  const claimedStart = startMatch?.[1] ?? null;
  const portMatch = readme.match(/port[:\s]+(\d{2,5})/i) || readme.match(/:(\d{4,5})/);
  const claimedPort = portMatch ? Number(portMatch[1]) : null;
  const mentionsSolari = /solari/i.test(readme);

  let startExists = false;
  if (!claimedStart) startExists = Boolean(stack.start);
  else if (stack.start) startExists = true;
  else startExists = false;

  return {
    claimedStart,
    startExists,
    claimedPort,
    portMatched: claimedPort === null || claimedPort === stack.port,
    mentionsSolari,
    solariInCode: solari.sandbox || solari.browser || solari.desktop,
  };
}

export type CriteriaInput = {
  solari: SolariDetection;
  testsOk: boolean | null;
  secrets: string[];
  preview: boolean;
  /** Present when the bay ran a script instead of serving a port. */
  script?: ScriptRun | null;
  /** false on a dry run: nothing was measured, so every line is a LOOK. */
  measured?: boolean;
};

export function evaluateCriteria(lines: string[], input: CriteriaInput) {
  if (input.measured === false) {
    return lines.map((label) => ({
      label,
      kind: "manual" as const,
      note: "Dry run: not measured.",
    }));
  }
  return lines.map((label) => {
    const l = label.toLowerCase();
    if (l.includes("record")) {
      return {
        label,
        kind: "auto" as const,
        met: input.solari.recording,
        note: input.solari.recording ? "Found a recording call." : "No recording call.",
      };
    }
    if (l.includes("sandbox")) {
      return {
        label,
        kind: "auto" as const,
        met: input.solari.sandbox,
        note: input.solari.sandbox ? "Sandbox import found." : "No sandbox import.",
      };
    }
    if (l.includes("browser")) {
      return {
        label,
        kind: "auto" as const,
        met: input.solari.browser,
        note: input.solari.browser ? "Browser import found." : "No browser import.",
      };
    }
    if (l.includes("secret")) {
      return {
        label,
        kind: "auto" as const,
        met: input.secrets.length === 0,
        note: input.secrets.length === 0 ? "None committed." : input.secrets.join("; "),
      };
    }
    if (l.includes("test")) {
      return {
        label,
        kind: "auto" as const,
        met: input.testsOk === true,
        note:
          input.testsOk === true
            ? "Passed."
            : input.testsOk === false
              ? "Failed."
              : "None ran.",
      };
    }
    if (l.includes("preview") || l.includes("live")) {
      if (input.script) {
        return { label, kind: "manual" as const, note: "Script, not a server. No preview expected." };
      }
      return {
        label,
        kind: "auto" as const,
        met: input.preview,
        note: input.preview ? "Preview came up." : "No preview URL.",
      };
    }
    if (input.script && /\bruns?\b|complet|exit/.test(l)) {
      const s = input.script;
      if (s.needsKey) {
        return {
          label,
          kind: "manual" as const,
          note: `Reads SOLARI_API_KEY; not run with ours. Exit ${s.exitCode ?? "?"} not judged.`,
        };
      }
      return {
        label,
        kind: "auto" as const,
        met: s.exitCode === 0 && !s.timedOut,
        note: s.timedOut ? "Timed out." : s.exitCode === 0 ? "Ran to completion, exit 0." : `Exit ${s.exitCode ?? "?"}.`,
      };
    }
    return { label, kind: "manual" as const, note: input.script ? "Read the transcript." : "Open the screenshot." };
  });
}
