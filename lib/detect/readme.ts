import type { DetectedStack } from "@/lib/detect/stack";
import type { ReadmeCheck, SolariDetection } from "@/lib/types";

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

export function evaluateCriteria(
  lines: string[],
  input: { solari: SolariDetection; testsOk: boolean | null; secrets: string[]; preview: boolean },
) {
  return lines.map((label) => {
    const l = label.toLowerCase();
    if (l.includes("record")) {
      return {
        label,
        kind: "auto" as const,
        met: input.solari.recording,
        note: input.solari.recording ? "Recording API used." : "No recording:true / replay call.",
      };
    }
    if (l.includes("sandbox")) {
      return {
        label,
        kind: "auto" as const,
        met: input.solari.sandbox,
        note: input.solari.sandbox ? "Sandbox SDK import found." : "No sandbox SDK import.",
      };
    }
    if (l.includes("browser")) {
      return {
        label,
        kind: "auto" as const,
        met: input.solari.browser,
        note: input.solari.browser ? "Browser SDK import found." : "No browser SDK import.",
      };
    }
    if (l.includes("secret")) {
      return {
        label,
        kind: "auto" as const,
        met: input.secrets.length === 0,
        note: input.secrets.length === 0 ? "No committed secrets detected." : input.secrets.join("; "),
      };
    }
    if (l.includes("test")) {
      return {
        label,
        kind: "auto" as const,
        met: input.testsOk === true,
        note:
          input.testsOk === true
            ? "Tests ran and passed."
            : input.testsOk === false
              ? "Tests ran and failed."
              : "No tests ran.",
      };
    }
    if (l.includes("preview") || l.includes("live")) {
      return {
        label,
        kind: "auto" as const,
        met: input.preview,
        note: input.preview ? "Preview URL came up." : "No live preview.",
      };
    }
    return { label, kind: "manual" as const, note: "Needs a human look." };
  });
}
