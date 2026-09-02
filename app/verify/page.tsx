"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { parseGithubRepo } from "@/lib/github/parse";

function peekRepo(input: string): { owner: string; name: string } | null {
  try {
    const repo = parseGithubRepo(input);
    return { owner: repo.owner, name: repo.name };
  } catch {
    return null;
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    /* empty body */
  }
  return res.statusText ? `${res.status} ${res.statusText}` : `HTTP ${res.status}`;
}

export default function VerifyPage() {
  const router = useRouter();
  const [repo, setRepo] = useState("");
  const [upstream, setUpstream] = useState("https://github.com/solari-sdk/solari-cookbook");
  const [accessKey, setAccessKey] = useState(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem("forklift-key") ?? "";
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const up = useMemo(() => peekRepo(upstream), [upstream]);
  const fork = useMemo(() => peekRepo(repo), [repo]);
  const formed = fork !== null;

  async function submit() {
    setBusy(true);
    setError(null);
    sessionStorage.setItem("forklift-key", accessKey);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessKey ? { "x-forklift-key": accessKey } : {}),
        },
        body: JSON.stringify({ kind: "verify", upstream, verifyUrl: repo.trim(), accessKey }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body: unknown = await res.json();
      if (body && typeof body === "object" && "job" in body) {
        const job = body.job as { id: string };
        router.push(`/floor/${job.id}`);
      } else {
        throw new Error("No job came back");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-svh flex-col">
      <div className="hazard" />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-14">
        <p className="text-[10px] tracking-[0.3em] text-[var(--mute)]">
          <Link href="/" className="hover:text-[var(--amber)]">
            ← FORKLIFT
          </Link>
        </p>
        <div className="paper relative mt-5 w-full px-8 py-8 pl-12 sm:px-12 sm:pl-16">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] tracking-[0.3em] opacity-70">FORM FK-1 · FIG. 1</p>
              <h1 className="stencil mt-1 text-3xl">Check my fork</h1>
            </div>
            <span className="stamp text-[11px]" style={{ color: "var(--stamp)" }}>
              Applicant
            </span>
          </div>

          <form
            className="mt-7"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="fork-sketch">
              <div className="fork-graph" data-formed={formed ? "true" : "false"}>
                <svg className="fork-svg" viewBox="0 0 400 280" preserveAspectRatio="none" aria-hidden>
                  <defs>
                    <filter id="wobble" x="-4%" y="-8%" width="108%" height="116%">
                      <feTurbulence
                        type="fractalNoise"
                        baseFrequency="0.9"
                        numOctaves="2"
                        seed="7"
                        result="n"
                      />
                      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.1" />
                    </filter>
                  </defs>
                  {/* stem: cookbook → next commit */}
                  <path
                    className="fork-ink"
                    filter="url(#wobble)"
                    d="M34 228 C36 180 32 120 34 58"
                  />
                  {/* stub off the next-commit node */}
                  <path
                    className="fork-dash"
                    filter="url(#wobble)"
                    d="M52 34 H118"
                  />
                  {/* dashed until a fork URL lands, then the solid branch */}
                  <path
                    className="fork-dash fork-branch-ghost"
                    filter="url(#wobble)"
                    d="M34 120 C34 60 140 34 252 34"
                  />
                  <path
                    className="fork-our"
                    filter="url(#wobble)"
                    d="M34 120 C34 60 140 34 252 34"
                  />
                </svg>

                <div className="fg-tl">
                  <div className="sketch-node sketch-node-ghost" aria-hidden>
                    <span className="sketch-dot" />
                    <span className="sketch-kicker">next commit</span>
                  </div>
                </div>

                <div className="fg-tr">
                  <div className="sketch-node sketch-node-fork">
                    <span className="sketch-dot" />
                    <span className="sketch-kicker">your fork</span>
                    {fork ? (
                      <span className="sketch-name">
                        {fork.owner}/{fork.name}
                      </span>
                    ) : null}
                    <input
                      className="sketch-field"
                      aria-label="Your fork URL"
                      placeholder="https://github.com/you/solari-cookbook"
                      value={repo}
                      onChange={(e) => setRepo(e.target.value)}
                    />
                  </div>
                </div>

                <div className="fg-stem" aria-hidden />

                <div className="fg-bl">
                  <div className="sketch-node sketch-node-up">
                    <span className="sketch-dot sketch-dot-solid" />
                    <span className="sketch-kicker">cookbook · upstream</span>
                    <span className="sketch-name">
                      {up ? `${up.owner}/${up.name}` : "upstream repo"}
                    </span>
                    <input
                      className="sketch-field"
                      aria-label="Upstream repo"
                      value={upstream}
                      onChange={(e) => setUpstream(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <p className="fork-note">
                {formed ? "Ready" : "Paste your GitHub fork URL"}
              </p>
            </div>

            <label className="mt-8 block text-[10px] tracking-[0.22em] opacity-70">ACCESS KEY</label>
            <input
              className="paper-field mt-1"
              type="password"
              autoComplete="off"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
            />
            <p className="mt-2 text-[11px] leading-5 opacity-60">
              This site’s password, not a Solari key.
            </p>

            {error ? (
              <div className="relative mt-6">
                <span className="stamp text-sm" style={{ color: "var(--stamp)" }}>
                  Rejected · {error}
                </span>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy || !formed}
              className="press stencil mt-8 w-full bg-[#26231c] px-4 py-3 text-lg tracking-wide text-[#ece3cd] hover:bg-[#3a362b] disabled:opacity-50"
            >
              {busy ? "Starting…" : "Inspect this fork"}
            </button>
          </form>
        </div>
      </div>
      <div className="hazard" />
    </main>
  );
}
