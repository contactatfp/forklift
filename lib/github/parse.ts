import type { GithubRepo } from "@/lib/types";

const REPO_RE =
  /^(?:https?:\/\/github\.com\/)?([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i;

export function parseGithubRepo(input: string, defaultBranch = "main"): GithubRepo {
  const trimmed = input.trim();
  const match = trimmed.match(REPO_RE);
  if (!match) {
    throw new Error(`Not a GitHub repo: ${input}`);
  }
  const owner = match[1];
  const name = match[2];
  return {
    owner,
    name,
    url: `https://github.com/${owner}/${name}`,
    defaultBranch,
    cloneUrl: `https://github.com/${owner}/${name}.git`,
  };
}

export function sameRepo(a: GithubRepo, b: GithubRepo): boolean {
  return a.owner.toLowerCase() === b.owner.toLowerCase() && a.name.toLowerCase() === b.name.toLowerCase();
}

export function parseCriteria(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}
