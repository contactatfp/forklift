import type { SolariDetection } from "@/lib/types";

const PKG_HINTS: Array<{ name: string; key: keyof Pick<SolariDetection, "sandbox" | "browser" | "desktop"> }> = [
  { name: "@solarisdk/sandbox", key: "sandbox" },
  { name: "@solarisdk/sdk", key: "sandbox" },
  { name: "solari-sandbox", key: "sandbox" },
  { name: "@solarisdk/browser", key: "browser" },
  { name: "solari", key: "browser" },
  { name: "@solarisdk/desktop", key: "desktop" },
  { name: "solari-desktop", key: "desktop" },
];

export function detectSolari(files: Record<string, string>): SolariDetection {
  const packages: string[] = [];
  const importHits: string[] = [];
  const found = { sandbox: false, browser: false, desktop: false, recording: false };

  const pkgText = files["package.json"] ?? "";
  const req = `${files["requirements.txt"] ?? ""}\n${files["pyproject.toml"] ?? ""}`;

  for (const hint of PKG_HINTS) {
    if (pkgText.includes(`"${hint.name}"`) || req.includes(hint.name)) {
      packages.push(hint.name);
      found[hint.key] = true;
    }
  }

  const corpus = Object.entries(files)
    .filter(([path]) => /\.(ts|tsx|js|jsx|py|md|yaml|yml)$/.test(path))
    .map(([path, text]) => ({ path, text }));

  for (const file of corpus) {
    if (/@solarisdk\/sandbox|SandboxClient|solari_sandbox|solari-sandbox/.test(file.text)) {
      found.sandbox = true;
      importHits.push(`${file.path}: sandbox`);
    }
    if (/@solarisdk\/browser|from ["']@solarisdk\/browser["']|new Solari\(/.test(file.text)) {
      found.browser = true;
      importHits.push(`${file.path}: browser`);
    }
    if (/@solarisdk\/desktop|solari_desktop|solari-desktop/.test(file.text)) {
      found.desktop = true;
      importHits.push(`${file.path}: desktop`);
    }
    if (/recording:\s*true|getReplayUrl|downloadReplay/.test(file.text)) {
      found.recording = true;
      importHits.push(`${file.path}: recording`);
    }
  }

  return {
    sandbox: found.sandbox,
    browser: found.browser,
    desktop: found.desktop,
    recording: found.recording,
    packages: [...new Set(packages)],
    importHits: [...new Set(importHits)].slice(0, 20),
  };
}
