"use client";

import { createContext, useCallback, useContext, useId, useRef, type ReactNode } from "react";
import type { CriterionResult } from "@/lib/types";

type InspectShotValue = {
  open: () => void;
  hasScreenshot: boolean;
};

const InspectShotContext = createContext<InspectShotValue | null>(null);

function useInspectShot() {
  const ctx = useContext(InspectShotContext);
  if (!ctx) throw new Error("InspectShot is missing");
  return ctx;
}

/** Older cards stored the LOOK note without `inspect`. */
function inspectFor(c: Extract<CriterionResult, { kind: "manual" }>): "screenshot" | "transcript" | undefined {
  if (c.inspect) return c.inspect;
  if (c.note === "Open the screenshot.") return "screenshot";
  if (c.note === "Read the transcript.") return "transcript";
  return undefined;
}

export function InspectShot({
  bayId,
  repoName,
  hasScreenshot,
  emptyReason,
  children,
}: {
  bayId: string;
  repoName: string;
  hasScreenshot: boolean;
  emptyReason: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = useCallback(() => {
    dialog.current?.showModal();
  }, []);
  const hangUp = useCallback(() => {
    dialog.current?.close();
  }, []);

  return (
    <InspectShotContext.Provider value={{ open, hasScreenshot }}>
      {children}
      <dialog
        ref={dialog}
        className="shot-lightbox"
        aria-labelledby={titleId}
        onClick={(e) => {
          if (e.target === e.currentTarget) hangUp();
        }}
      >
        <div className="shot-lightbox-bay">
          <div className="hazard" />
          <div className="crt-bar">
            <h2 id={titleId} className="min-w-0 truncate text-[10px] font-normal tracking-[0.18em] text-[var(--mute)]">
              MONITOR · {repoName}
            </h2>
            <button type="button" className="shot-expand press" onClick={hangUp}>
              HANG UP
            </button>
          </div>
          <div className="shot-lightbox-body">
            {hasScreenshot ? (
              // PNG lives in our DB; next/image would just fight the bytes.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/bays/${bayId}/screenshot`} alt={`${repoName} preview screenshot`} />
            ) : (
              <p className="shot-nosignal">{emptyReason}</p>
            )}
          </div>
        </div>
      </dialog>
    </InspectShotContext.Provider>
  );
}

export function ShotBezel({
  src,
  alt,
  hasScreenshot,
  emptyReason,
}: {
  src: string;
  alt: string;
  hasScreenshot: boolean;
  emptyReason: string;
}) {
  const { open } = useInspectShot();
  return (
    <section id="artifact" className="bezel crt">
      <div className="crt-bar">
        <span>PREVIEW</span>
        {hasScreenshot ? (
          <button type="button" className="shot-expand press" onClick={open} aria-haspopup="dialog">
            EXPAND
          </button>
        ) : (
          <span>NO SIGNAL</span>
        )}
      </div>
      {hasScreenshot ? (
        <button type="button" className="shot-hit" onClick={open} aria-haspopup="dialog">
          {/* eslint-disable-next-line @next/next/no-img-element -- PNG straight out of our own DB, no loader wanted */}
          <img src={src} alt={alt} />
        </button>
      ) : (
        <p className="p-10 text-center text-sm text-[var(--mute)]">{emptyReason}</p>
      )}
    </section>
  );
}

export function CriterionRow({ c }: { c: CriterionResult }) {
  const shot = useInspectShot();
  const inspect = c.kind === "manual" ? inspectFor(c) : undefined;
  const state = c.kind === "manual" ? "man" : c.met ? "yes" : "no";
  const label = c.kind === "manual" ? "LOOK" : c.met ? "YES" : "NO";

  let stamp: ReactNode;
  if (inspect === "screenshot") {
    stamp = (
      <button
        type="button"
        className="stamp stamp-man stamp-look press"
        onClick={shot.open}
        aria-haspopup="dialog"
        aria-label={shot.hasScreenshot ? "Open screenshot" : "Open monitor — no screenshot"}
      >
        LOOK
      </button>
    );
  } else if (inspect === "transcript") {
    stamp = (
      <a href="#artifact" className="stamp stamp-man stamp-look">
        LOOK
      </a>
    );
  } else {
    stamp = <span className={`stamp stamp-${state} flex-none text-[10px]`}>{label}</span>;
  }

  return (
    <li className="criterion-row">
      <div className="min-w-0">
        <p className="text-sm text-[var(--fog)]">{c.label}</p>
        <p className="mt-0.5 text-[11px] leading-5">
          {inspect === "screenshot" ? (
            <button type="button" className={`shot-note press${shot.hasScreenshot ? "" : " dead"}`} onClick={shot.open}>
              {shot.hasScreenshot ? "Open the screenshot." : "No screenshot — open the monitor."}
            </button>
          ) : inspect === "transcript" ? (
            <a href="#artifact" className="shot-note">
              Read the transcript.
            </a>
          ) : (
            <span className="text-[var(--mute)]">{c.note}</span>
          )}
        </p>
      </div>
      <span className="flex-none">{stamp}</span>
    </li>
  );
}
