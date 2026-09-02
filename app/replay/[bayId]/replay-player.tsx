"use client";

import { useEffect, useRef, useState } from "react";
import "rrweb-player/dist/style.css";

type State = { kind: "loading" } | { kind: "empty"; note: string } | { kind: "ready"; count: number };

export function ReplayPlayer({ bayId }: { bayId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    async function load() {
      const res = await fetch(`/api/bays/${bayId}/replay/events`);
      const body = (await res.json()) as { events?: unknown[]; error?: string };
      if (cancelled) return;
      if (!res.ok || !body.events?.length) {
        setState({ kind: "empty", note: body.error ?? "Solari published an empty tape for this session." });
        return;
      }
      const { default: Player } = await import("rrweb-player");
      if (cancelled || !host.current) return;
      const width = Math.min(host.current.clientWidth, 1024);
      // FullSnapshot is what the player actually needs; the gateway's 401/403 pages still have one
      const player = new Player({
        target: host.current,
        props: {
          events: body.events as never,
          width,
          height: Math.round((width * 9) / 16),
          autoPlay: true,
          skipInactive: true,
          showController: true,
        },
      });
      const mount = host.current;
      destroy = () => {
        try {
          player.pause();
          player.getReplayer().destroy();
        } catch {
          /* already gone */
        }
        mount.replaceChildren();
      };
      setState({ kind: "ready", count: body.events.length });
    }
    void load().catch((err: unknown) => {
      if (!cancelled) setState({ kind: "empty", note: err instanceof Error ? err.message : String(err) });
    });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [bayId]);

  return (
    <div>
      <div ref={host} className="replay-host" />
      {state.kind === "loading" ? (
        <p className="p-10 text-center text-sm text-[var(--mute)]">Pulling the tape from Solari…</p>
      ) : null}
      {state.kind === "empty" ? <p className="p-10 text-center text-sm text-[var(--mute)]">{state.note}</p> : null}
      {state.kind === "ready" ? (
        <p className="mt-3 text-[10px] tracking-[0.2em] text-[var(--mute)]">
          {state.count} RRWEB EVENTS · RECORDED BY THE SOLARI BROWSER, PLAYED BACK HERE
        </p>
      ) : null}
    </div>
  );
}
