const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "__pycache__",
  ".venv",
  "venv",
  ".turbo",
]);

const SKIP_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "uv.lock",
]);

const PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "solari live key", re: /slr_live_[A-Za-z0-9]+/ },
  { name: "github pat", re: /github_pat_[A-Za-z0-9_]+/ },
  { name: "github token", re: /\bghp_[A-Za-z0-9]{20,}/ },
  { name: "aws access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "private key", re: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/ },
  { name: "openai key", re: /\bsk-[A-Za-z0-9]{20,}/ },
];

export function scanSecrets(files: Array<{ path: string; text: string }>): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const base = file.path.split("/").pop() ?? file.path;
    if (SKIP_FILES.has(base)) continue;
    if (base.endsWith(".example") || base.endsWith(".sample")) continue;
    const parts = file.path.split("/");
    if (parts.some((part) => SKIP_DIRS.has(part))) continue;
    for (const pat of PATTERNS) {
      if (pat.re.test(file.text)) {
        hits.push(`${pat.name} in ${file.path}`);
      }
    }
  }
  return hits;
}

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const SECRET_SCAN_SCRIPT = readFileSync(
  join(process.cwd(), "lib/detect/scan_secrets.py"),
  "utf8",
);
