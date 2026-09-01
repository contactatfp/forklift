"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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

export function RecentFloors() {
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
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  if (denied) {
    return (
      <p className="mt-8 max-w-md text-[11px] tracking-[0.12em] text-[var(--mute)]">
        RECENT FLOORS · enter access key on the slip to list past jobs
      </p>
    );
  }

  if (!jobs.length) return null;

  return (
    <div className="mt-8 max-w-md">
      <p className="text-[10px] tracking-[0.22em] text-[var(--mute)]">RECENT FLOORS</p>
      <ul className="mt-3 space-y-2">
        {jobs.map((job) => {
          const label = job.upstream.replace(/^https?:\/\/github\.com\//, "");
          return (
            <li key={job.id}>
              <Link
                href={`/floor/${job.id}`}
                className="flex items-baseline justify-between gap-3 border-b border-[var(--line-soft)] py-2 text-sm text-[var(--fog)] hover:text-[var(--amber)]"
              >
                <span className="min-w-0 truncate">
                  <span className="text-[10px] tracking-[0.15em] text-[var(--mute)] uppercase">
                    {job.kind}
                  </span>{" "}
                  {label}
                </span>
                <span className="flex-none text-[10px] tracking-[0.12em] uppercase text-[var(--mute)]">
                  {job.fixture ? "fixture · " : ""}
                  {job.status}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
