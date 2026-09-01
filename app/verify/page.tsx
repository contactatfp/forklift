"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
      const body: unknown = await res.json();
      if (!res.ok) {
        const msg =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      if (body && typeof body === "object" && "job" in body) {
        const job = body.job as { id: string };
        router.push(`/floor/${job.id}`);
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
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-14">
        <p className="text-[10px] tracking-[0.3em] text-[var(--mute)]">
          <Link href="/" className="hover:text-[var(--amber)]">
            ← FORKLIFT
          </Link>
        </p>
        <div className="paper relative mt-5 px-10 py-8 pl-14 sm:px-12 sm:pl-16">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] tracking-[0.3em] opacity-70">FORM FK-1 · REV 1</p>
              <h1 className="stencil mt-1 text-3xl">Verify my submission</h1>
            </div>
            <span className="stamp text-[11px]" style={{ color: "var(--stamp)" }}>
              Applicant
            </span>
          </div>
          <p className="mt-4 text-[12px] leading-6 opacity-80">
            See what the dock sees. Your fork gets one sandbox, one recorded browser pass, and the
            same evidence card the judges get — before they ever look.
          </p>

          <form
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="block text-[10px] tracking-[0.22em] opacity-70">YOUR FORK URL</label>
            <input
              className="paper-field mt-1"
              placeholder="https://github.com/you/solari-cookbook"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
            />

            <label className="mt-5 block text-[10px] tracking-[0.22em] opacity-70">UPSTREAM REPO</label>
            <input
              className="paper-field mt-1"
              value={upstream}
              onChange={(e) => setUpstream(e.target.value)}
            />

            <label className="mt-5 block text-[10px] tracking-[0.22em] opacity-70">ACCESS KEY</label>
            <input
              className="paper-field mt-1"
              type="password"
              autoComplete="off"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
            />

            {error ? (
              <div className="relative mt-6">
                <span className="stamp text-sm" style={{ color: "var(--stamp)" }}>
                  Rejected · {error}
                </span>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy || !repo.trim()}
              className="stencil mt-8 w-full bg-[#26231c] px-4 py-3 text-lg tracking-wide text-[#ece3cd] transition-colors hover:bg-[#3a362b] disabled:opacity-50"
            >
              {busy ? "Inspecting…" : "Run inspection"}
            </button>
          </form>
        </div>
      </div>
      <div className="hazard" />
    </main>
  );
}
