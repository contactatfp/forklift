import { Octokit } from "octokit";
import { parseGithubRepo, sameRepo } from "@/lib/github/parse";
import { log } from "@/lib/log";
import type { ForkHit, GithubRepo } from "@/lib/types";

function octokit(): Octokit {
  const auth = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  return new Octokit(auth ? { auth } : {});
}

type ForkPayload = {
  full_name?: string;
  html_url: string;
  clone_url?: string;
  default_branch?: string;
  pushed_at: string | null;
  created_at: string;
  stargazers_count?: number;
  owner: { login: string };
  name: string;
};

export async function listForks(upstream: GithubRepo): Promise<ForkHit[]> {
  const client = octokit();
  const forks = (await client.paginate("GET /repos/{owner}/{repo}/forks", {
    owner: upstream.owner,
    repo: upstream.name,
    per_page: 100,
    sort: "newest",
  })) as ForkPayload[];

  log("github.forks", { count: forks.length, upstream: upstream.url });

  return forks.map((fork) => ({
    owner: fork.owner.login,
    name: fork.name,
    url: fork.html_url,
    defaultBranch: fork.default_branch ?? "main",
    cloneUrl: fork.clone_url ?? `${fork.html_url}.git`,
    pushedAt: fork.pushed_at ?? fork.created_at,
    createdAt: fork.created_at,
    stars: fork.stargazers_count ?? 0,
    aheadBy: null,
    changedFiles: null,
  }));
}

export async function compareFork(upstream: GithubRepo, fork: ForkHit): Promise<ForkHit> {
  const client = octokit();
  try {
    const basehead = `${upstream.owner}:${upstream.defaultBranch}...${fork.owner}:${fork.defaultBranch}`;
    const { data } = await client.request("GET /repos/{owner}/{repo}/compare/{basehead}", {
      owner: fork.owner,
      repo: fork.name,
      basehead,
    });
    return {
      ...fork,
      aheadBy: data.ahead_by,
      changedFiles: data.files?.length ?? null,
    };
  } catch (err) {
    log("github.compare.fail", { fork: fork.url, err: String(err) });
    return fork;
  }
}

export function looksEmpty(fork: ForkHit): boolean {
  if (fork.aheadBy === 0) return true;
  return fork.pushedAt === fork.createdAt;
}

export async function pickReviewSet(input: {
  upstream: GithubRepo;
  forks: ForkHit[];
  selfRepo: GithubRepo | null;
  verifyUrl?: string;
  limit?: number;
}): Promise<ForkHit[]> {
  const limit = input.limit ?? 5;
  if (input.verifyUrl) {
    const repo = parseGithubRepo(input.verifyUrl);
    const hit: ForkHit = {
      ...repo,
      pushedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      stars: 0,
      aheadBy: null,
      changedFiles: null,
    };
    return [hit];
  }

  const candidates = input.forks.filter((fork) => !looksEmpty(fork));
  candidates.sort((a, b) => {
    if (b.stars !== a.stars) return b.stars - a.stars;
    return Date.parse(b.pushedAt) - Date.parse(a.pushedAt);
  });

  const top = candidates.slice(0, 16);
  const compared = await Promise.all(top.map((fork) => compareFork(input.upstream, fork)));
  compared.sort((a, b) => {
    const ahead = (b.aheadBy ?? 0) - (a.aheadBy ?? 0);
    if (ahead !== 0) return ahead;
    return (b.changedFiles ?? 0) - (a.changedFiles ?? 0);
  });

  const picked: ForkHit[] = [];
  for (const fork of compared) {
    if (fork.aheadBy === 0) continue;
    if (input.selfRepo && sameRepo(fork, input.selfRepo)) continue;
    picked.push(fork);
    if (picked.length >= limit - (input.selfRepo ? 1 : 0)) break;
  }

  if (input.selfRepo) {
    picked.push({
      ...input.selfRepo,
      pushedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      stars: 0,
      aheadBy: null,
      changedFiles: null,
    });
  }

  return picked.slice(0, limit);
}
