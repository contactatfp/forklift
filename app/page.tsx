"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const DEFAULT_CRITERIA = `Uses Solari sandboxes as infrastructure
Uses Solari browser recording
Ships a real product, not a tutorial clone
No secrets in the submitted code`;

const SPECS: Array<[string, string]> = [
  ["CAPACITY", "300 forks / shift"],
  ["BAYS", "05 live"],
  ["DRIVE", "Solari sandbox + recorded browser"],
  ["POLICY", "evidence only · no ranking"],
];

function key(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("forklift-key") ?? "";
}

function saveKey(value: string) {
  sessionStorage.setItem("forklift-key", value);
}

function Requisition() {
  const router = useRouter();
  const [upstream, setUpstream] = useState("https://github.com/solari-sdk/solari-cookbook");
  const [criteria, setCriteria] = useState(DEFAULT_CRITERIA);
  const [selfRepo, setSelfRepo] = useState("");
  const [verifyUrl, setVerifyUrl] = useState("");
  const [accessKey, setAccessKey] = useState(key);
  const [busy, setBusy] = useState<"contest" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(kind: "contest" | "verify") {
    setBusy(kind);
    setError(null);
    saveKey(accessKey);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessKey ? { "x-forklift-key": accessKey } : {}),
        },
        body: JSON.stringify({
          kind,
          upstream,
          criteria,
          selfRepo: selfRepo.trim() || "local",
          verifyUrl: verifyUrl.trim() || undefined,
          accessKey,
        }),
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
      setBusy(null);
    }
  }

  return (
    <div className="paper relative px-10 py-8 pl-14 sm:px-12 sm:pl-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] tracking-[0.3em] opacity-70">FORM FK-300 · REV 1</p>
          <h2 className="stencil mt-1 text-3xl">Review requisition</h2>
        </div>
        <span className="stamp text-[11px]" style={{ color: "var(--stamp)" }}>
          Freight
        </span>
      </div>

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(verifyUrl.trim() ? "verify" : "contest");
        }}
      >
        <label className="block text-[10px] tracking-[0.22em] opacity-70">
          CONSIGNMENT · UPSTREAM REPO
        </label>
        <input className="paper-field mt-1" value={upstream} onChange={(e) => setUpstream(e.target.value)} />

        <label className="mt-5 block text-[10px] tracking-[0.22em] opacity-70">
          INSPECTION CRITERIA · ONE PER LINE
        </label>
        <textarea
          className="paper-field mt-1 min-h-28 resize-y leading-[28px]"
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
        />

        <label className="mt-5 block text-[10px] tracking-[0.22em] opacity-70">
          DECLARED SELF · BLANK PACKS THIS TREE AS BAY 05
        </label>
        <input
          className="paper-field mt-1"
          placeholder="https://github.com/you/forklift"
          value={selfRepo}
          onChange={(e) => setSelfRepo(e.target.value)}
        />

        <label className="mt-5 block text-[10px] tracking-[0.22em] opacity-70">
          SINGLE SHIPMENT · VERIFY ONE FORK
        </label>
        <input
          className="paper-field mt-1"
          placeholder="https://github.com/applicant/solari-cookbook"
          value={verifyUrl}
          onChange={(e) => setVerifyUrl(e.target.value)}
        />

        <label className="mt-5 block text-[10px] tracking-[0.22em] opacity-70">AUTHORIZATION KEY</label>
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

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void submit("contest")}
            className="stencil flex-1 bg-[#26231c] px-4 py-3 text-lg tracking-wide text-[#ece3cd] transition-colors hover:bg-[#3a362b] disabled:opacity-50"
          >
            {busy === "contest" ? "Filing…" : "File requisition"}
          </button>
          <button
            type="button"
            disabled={busy !== null || !verifyUrl.trim()}
            onClick={() => void submit("verify")}
            className="flex-1 border-2 border-[#26231c] px-4 py-3 text-[11px] font-semibold tracking-[0.18em] transition-colors hover:bg-[#26231c] hover:text-[#ece3cd] disabled:opacity-40"
          >
            {busy === "verify" ? "VERIFYING…" : "VERIFY MY SUBMISSION"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col">
      <div className="hazard" />
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-10 px-6 py-12 lg:grid-cols-[1fr_1.05fr] lg:items-center">
        <header className="relative">
          <div className="relative">
            <div className="flex items-center gap-3 text-[10px] tracking-[0.35em] text-[var(--mute)]">
              <span className="lamp lamp-live" style={{ color: "var(--amber)" }} />
              PINETREE / SOLARI CHALLENGE
            </div>
            <h1 className="stencil mt-4 text-[clamp(3.5rem,9vw,6.5rem)] leading-[0.85] text-[#f3ead8]">
              FORK
              <br />
              LIFT
            </h1>
            <p className="mt-6 max-w-md text-lg text-[var(--fog)]">Review 300 forks before lunch.</p>
            <p className="mt-3 max-w-md text-sm leading-6 text-[var(--mute)]">
              Every submission fork gets its own dock: cloned into an isolated Solari sandbox,
              built, walked by a recorded browser, and stamped onto an evidence card. No
              scoreboard. No hire button.
            </p>
            <dl className="mt-10 max-w-md">
              {SPECS.map(([k, v]) => (
                <div key={k} className="mrow">
                  <dt>{k}</dt>
                  <span className="dots" />
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 text-[11px] tracking-[0.2em] text-[var(--mute)]">
              APPLICANT? <Link href="/verify" className="text-[var(--amber)]">VERIFY MY SUBMISSION →</Link>
            </p>
          </div>
        </header>

        <Requisition />
      </div>
      <div className="hazard" />
    </main>
  );
}
