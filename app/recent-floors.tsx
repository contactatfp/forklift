"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";

type RecentJob = {
  id: string;
  kind: string;
  status: string;
  upstream: string;
  forkCount: number | null;
  fixture: boolean;
  createdAt: number;
};

function accessKey(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("forklift-key") ?? "";
}

/** Fixed HISTORY control + slide-out drawer. Never sits in the homepage column. */
export function RecentFloors() {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<RecentJob[]>([]);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    const key = accessKey();
    try {
      const res = await fetch("/api/jobs", {
        headers: key ? { "x-forklift-key": key } : {},
      });
      if (res.status === 401) {
        setDenied(true);
        setJobs([]);
        return;
      }
      setDenied(false);
      if (!res.ok) return;
      const body: unknown = await res.json();
      if (!body || typeof body !== "object" || !("jobs" in body)) return;
      const list = (body as { jobs: unknown }).jobs;
      if (!Array.isArray(list)) return;
      setJobs(list as RecentJob[]);
    } catch {
      /* quiet */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function openHistory() {
    setOpen(true);
    void load();
  }

  return (
    <>
      <button
        type="button"
        onClick={openHistory}
        className="press fixed top-6 right-6 z-40 border border-[var(--line)] bg-[var(--plate)] px-3 py-2 text-[10px] tracking-[0.22em] text-[var(--mute)] hover:border-[var(--amber)] hover:text-[var(--amber)]"
      >
        HISTORY
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Close history"
            className="absolute inset-0 bg-black/55"
            onClick={() => setOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="history-drawer relative flex h-full w-full max-w-sm flex-col border-l border-[var(--line)] bg-[var(--plate)] shadow-[-24px_0_60px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
              <h2 id={titleId} className="stencil text-sm text-[var(--amber)]">
                Recent floors
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="press text-[10px] tracking-[0.22em] text-[var(--mute)] hover:text-[var(--amber)]"
              >
                CLOSE
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {denied ? (
                <p className="text-[11px] leading-5 tracking-[0.08em] text-[var(--mute)]">
                  Enter the access key on the slip, then open History again.
                </p>
              ) : !jobs.length ? (
                <p className="text-[11px] leading-5 tracking-[0.08em] text-[var(--mute)]">
                  No floors yet. Run a review and they show up here.
                </p>
              ) : (
                <ul className="space-y-1">
                  {jobs.map((job) => {
                    const label = job.upstream.replace(/^https?:\/\/github\.com\//, "");
                    return (
                      <li key={job.id}>
                        <Link
                          href={`/floor/${job.id}`}
                          onClick={() => setOpen(false)}
                          className="flex items-baseline justify-between gap-3 border-b border-[var(--line-soft)] py-3 text-sm text-[var(--fog)] hover:text-[var(--amber)]"
                        >
                          <span className="min-w-0 truncate">
                            <span className="text-[10px] tracking-[0.15em] text-[var(--mute)] uppercase">
                              {job.kind}
                            </span>{" "}
                            {label}
                          </span>
                          <span className="flex-none text-[10px] tracking-[0.12em] uppercase text-[var(--mute)]">
                            {job.fixture ? "dry run · " : ""}
                            {job.status}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
