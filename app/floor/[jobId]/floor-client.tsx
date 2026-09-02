"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { Bay, BayStatus, EngineEvent, Job, RunKind } from "@/lib/types";
import { DryRunNotice } from "@/app/dry-run-notice";

type Step = { key: BayStatus; label: string };

// servers get a browser walk; scripts run once and hand back a transcript
const SERVER_STEPS: Step[] = [
  { key: "cloning", label: "CLONE" },
  { key: "scanning", label: "SCAN" },
  { key: "installing", label: "INSTALL" },
  { key: "testing", label: "TEST" },
  { key: "building", label: "BUILD" },
  { key: "preview", label: "PREV" },
  { key: "recording", label: "REC" },
];

const SCRIPT_STEPS: Step[] = [
  { key: "cloning", label: "CLONE" },
  { key: "scanning", label: "SCAN" },
  { key: "installing", label: "INSTALL" },
  { key: "testing", label: "TEST" },
  { key: "running", label: "RUN" },
];

function lampColor(status: BayStatus) {
  if (status === "done") return "var(--ok)";
  if (status === "failed") return "var(--bad)";
  if (status === "queued") return "var(--mute)";
  return "var(--amber)";
}

function StepRail({ status, mode }: { status: BayStatus; mode: RunKind | null }) {
  const STEPS = mode === "script" ? SCRIPT_STEPS : SERVER_STEPS;
  const idx = STEPS.findIndex((s) => s.key === status);
  const current = status === "done" ? STEPS.length : idx;
  const dead = status === "failed";
  return (
    <div className="flex gap-1 px-4 pt-2 pb-1">
      {STEPS.map((step, i) => {
        let cls = "step";
        if (dead) cls += i <= Math.max(current, 0) ? " dead" : "";
        else if (i < current) cls += " done";
        else if (i === current) cls += " active";
        return (
          <div key={step.key} className={cls}>
            <div className="tick" />
            <span>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function LogPane({ logs }: { logs: string[] }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);
  return (
    <pre ref={ref} className="term mx-3 mb-3 h-36 flex-none p-3">
      {(logs.length ? logs : ["queued"]).slice(-60).join("\n")}
    </pre>
  );
}

function BayDoor({ bay, i }: { bay: Bay; i: number }) {
  const live = bay.status !== "queued" && bay.status !== "done" && bay.status !== "failed";
  const href = bay.status === "done" || bay.evidence ? `/cards/${bay.id}` : undefined;
  const door = (
    <article
      className="plate rivets bay-in flex h-full flex-col overflow-hidden"
      style={{ "--i": i } as CSSProperties}
    >
      <div className="hazard" style={{ height: 6 }} />
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="stencil text-4xl text-[#f3ead8]">{String(bay.bay).padStart(2, "0")}</span>
        <span className="flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase text-[var(--mute)]">
          <span
            className={`lamp ${live ? "lamp-live" : ""}`}
            style={{ color: lampColor(bay.status) }}
          />
          {bay.status}
        </span>
      </div>
      <div className="px-4 pt-1 pb-2">
        <p className="truncate text-sm text-[var(--fog)]" title={`${bay.repo.owner}/${bay.repo.name}`}>
          {bay.repo.owner}/{bay.repo.name}
        </p>
        {bay.isSelf ? (
          <p className="mt-1 text-[10px] tracking-[0.25em] text-[var(--amber)]">SELF · FORKLIFT</p>
        ) : null}
      </div>
      <StepRail status={bay.status} mode={bay.mode ?? bay.evidence?.kind ?? null} />
      <LogPane logs={bay.logs} />
    </article>
  );

  if (href) {
    return (
      <Link href={href} className="press block h-full">
        {door}
      </Link>
    );
  }
  return door;
}

function EmptyDoor({ n }: { n: number }) {
  return (
    <article className="plate min-h-[300px] opacity-35">
      <div className="hazard" style={{ height: 6 }} />
      <div className="px-4 pt-3">
        <span className="stencil text-4xl">{String(n).padStart(2, "0")}</span>
        <p className="mt-8 text-[10px] tracking-[0.25em] text-[var(--mute)]">EMPTY</p>
      </div>
    </article>
  );
}

function ShiftClock() {
  const [now, setNow] = useState("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      setNow(`${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}Z`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums text-[var(--amber)]">{now || "--:--:--"}</span>;
}

function Odometer({ value }: { value: number | null | undefined }) {
  const text = value === null || value === undefined ? "···" : String(value);
  return (
    <span className="odo" title="forks found">
      {text.split("").map((ch, i) => (
        <b key={i}>{ch}</b>
      ))}
    </span>
  );
}

function applyEvent(
  event: EngineEvent,
  setJob: (job: Job) => void,
  setBays: Dispatch<SetStateAction<Bay[]>>,
) {
  if (event.type === "job") setJob(event.job);
  if (event.type === "bay") {
    setBays((prev) => {
      const next = prev.filter((b) => b.id !== event.bay.id);
      next.push(event.bay);
      next.sort((a, b) => a.bay - b.bay);
      return next;
    });
  }
  if (event.type === "log") {
    setBays((prev) =>
      prev.map((bay) =>
        bay.id === event.bayId ? { ...bay, logs: [...bay.logs, event.line].slice(-400) } : bay,
      ),
    );
  }
}

export function FloorClient({
  jobId,
  initialJob,
  initialBays,
}: {
  jobId: string;
  initialJob: Job;
  initialBays: Bay[];
}) {
  const [job, setJob] = useState<Job | null>(initialJob);
  const [bays, setBays] = useState<Bay[]>(initialBays);

  useEffect(() => {
    let closed = false;
    // refresh in case SSR was slightly stale; SSE carries the live bits
    void (async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const body: unknown = await res.json();
        if (closed || !body || typeof body !== "object") return;
        const rec = body as { job?: Job; bays?: Bay[] };
        if (rec.job) setJob(rec.job);
        if (Array.isArray(rec.bays)) setBays(rec.bays);
      } catch {
        /* stream may still fill */
      }
    })();

    const src = new EventSource(`/api/jobs/${jobId}/stream`);
    src.onmessage = (msg) => {
      try {
        applyEvent(JSON.parse(msg.data) as EngineEvent, setJob, setBays);
      } catch {
        /* ignore malformed frame */
      }
    };
    return () => {
      closed = true;
      src.close();
    };
  }, [jobId]);

  const done = useMemo(
    () => bays.filter((b) => b.status === "done" || b.status === "failed").length,
    [bays],
  );

  const expectedBays = job?.kind === "verify" ? 1 : 5;
  const bayTotal = bays.length || (job ? expectedBays : 0);

  let doors: ReactNode;
  if (bays.length) {
    doors = (
      <div
        className={`grid gap-4 ${
          bays.length === 1 ? "max-w-md md:grid-cols-1" : "md:grid-cols-2 xl:grid-cols-5"
        }`}
      >
        {bays.map((bay, i) => (
          <BayDoor key={bay.id} bay={bay} i={i} />
        ))}
      </div>
    );
  } else if (!job) {
    doors = (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[1, 2, 3, 4, 5].map((n) => (
          <EmptyDoor key={n} n={n} />
        ))}
      </div>
    );
  } else if (job.kind === "verify") {
    doors = (
      <div className="max-w-md">
        <EmptyDoor n={1} />
        <p className="mt-3 text-[11px] tracking-[0.15em] text-[var(--mute)]">Starting…</p>
      </div>
    );
  } else if (job.status === "queued" || job.status === "discovering") {
    doors = (
      <div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((n) => (
            <EmptyDoor key={n} n={n} />
          ))}
        </div>
        <p className="mt-3 text-[11px] tracking-[0.15em] text-[var(--mute)]">
          FINDING FORKS…
        </p>
      </div>
    );
  } else {
    doors = (
      <p className="text-sm text-[var(--mute)]">Starting…</p>
    );
  }

  return (
    <div className="flex min-h-svh flex-col">
      <div className="hazard" />
      <div className="flex flex-1 flex-col px-6 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-6 border-b border-[var(--line)] pb-6">
          <div className="flex flex-wrap items-center gap-5">
            <Link href="/" className="stencil text-2xl text-[#f3ead8] hover:text-[var(--amber)]">
              FORKLIFT
            </Link>
            <span className="text-[10px] tracking-[0.3em] text-[var(--mute)]">FLOOR</span>
            {job?.fixture ? (
              <span className="stamp text-[10px]" style={{ color: "var(--amber)" }}>
                DRY RUN
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-6 text-[11px] tracking-[0.15em] text-[var(--mute)]">
            <span>
              FORKS <Odometer value={job?.forkCount} />
            </span>
            <span>
              BAYS{" "}
              <b className="text-[var(--fog)]">
                {done}/{bayTotal || expectedBays}
              </b>
            </span>
            <span className="uppercase">{job?.status ?? "…"}</span>
            <ShiftClock />
          </div>
        </div>

        {job?.fixture ? (
          <div className="mb-6">
            <DryRunNotice />
          </div>
        ) : null}

        {job?.error ? <p className="mb-6 max-w-2xl text-sm text-[var(--bad)]">{job.error}</p> : null}

        {doors}
      </div>
      <div className="hazard" />
    </div>
  );
}
