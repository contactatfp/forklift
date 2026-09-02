import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/store";
import { ReplayPlayer } from "./replay-player";

export default async function ReplayPage({ params }: { params: Promise<{ bayId: string }> }) {
  const { bayId } = await params;
  const store = await getStore();
  const bay = await store.getBay(bayId);
  if (!bay) notFound();
  const sessionId = bay.evidence?.browserSessionId ?? null;

  return (
    <main className="flex min-h-svh flex-col">
      <div className="hazard" />
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-6">
          <div>
            <Link href={`/cards/${bay.id}`} className="text-[10px] tracking-[0.3em] text-[var(--mute)] hover:text-[var(--amber)]">
              ← CARD
            </Link>
            <h1 className="stencil mt-3 text-5xl text-[#f3ead8]">REPLAY</h1>
            <p className="mt-2 text-sm text-[var(--fog)]">
              {bay.repo.owner}/{bay.repo.name} · bay {String(bay.bay).padStart(2, "0")}
            </p>
          </div>
          {sessionId ? (
            <a
              href={`/api/bays/${bay.id}/replay`}
              className="press border border-[var(--line)] px-4 py-2 text-[11px] tracking-[0.18em] text-[var(--fog)] hover:border-[var(--amber)] hover:text-[var(--amber)]"
            >
              RAW .NDJSON.GZ
            </a>
          ) : null}
        </div>

        <section className="bezel mt-8">
          {sessionId ? (
            <ReplayPlayer bayId={bay.id} />
          ) : (
            <p className="p-10 text-center text-sm text-[var(--mute)]">No recorded browser session for this bay.</p>
          )}
        </section>
        {sessionId ? (
          <p className="mt-4 text-[11px] leading-5 text-[var(--mute)]">
            Solari browser session <code>{sessionId.slice(-40)}</code>. The tape is the rrweb stream Solari publishes for a
            <code> recording: true</code> session; Forklift downloads it with <code>sessions.downloadReplay</code> and plays it here.
          </p>
        ) : null}
      </div>
    </main>
  );
}
