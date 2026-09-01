import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/store";
import type { CriterionResult } from "@/lib/types";
import { OpenPreview } from "./open-preview";

function Criterion({ c }: { c: CriterionResult }) {
  const state = c.kind === "manual" ? "man" : c.met ? "yes" : "no";
  const label = c.kind === "manual" ? "HUMAN" : c.met ? "YES" : "NO";
  return (
    <li className="flex items-center justify-between gap-4 border-b border-[var(--line-soft)] py-3 last:border-none">
      <div className="min-w-0">
        <p className="text-sm text-[var(--fog)]">{c.label}</p>
        <p className="mt-0.5 text-[11px] leading-5 text-[var(--mute)]">{c.note}</p>
      </div>
      <span className={`stamp stamp-${state} flex-none text-[10px]`}>{label}</span>
    </li>
  );
}

function Flag({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className="border px-2 py-1 text-[10px] tracking-[0.15em]"
      style={{
        color: on ? "var(--ok)" : "var(--mute)",
        borderColor: on ? "var(--ok)" : "var(--line)",
        opacity: on ? 1 : 0.6,
      }}
    >
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="plate rivets p-6">
      <h2 className="stencil text-sm text-[var(--amber)]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function CardPage({ params }: { params: Promise<{ bayId: string }> }) {
  const { bayId } = await params;
  const store = await getStore();
  const bay = await store.getBay(bayId);
  if (!bay) notFound();
  const ev = bay.evidence;

  return (
    <main className="flex min-h-svh flex-col">
      <div className="hazard" />
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-6">
          <div>
            <Link
              href={bay.jobId ? `/floor/${bay.jobId}` : "/"}
              className="text-[10px] tracking-[0.3em] text-[var(--mute)] hover:text-[var(--amber)]"
            >
              ← DISPATCH FLOOR
            </Link>
            <h1 className="stencil mt-3 text-5xl text-[#f3ead8]">
              BAY {String(bay.bay).padStart(2, "0")}
            </h1>
            <p className="mt-2 text-sm text-[var(--fog)]">
              {bay.repo.owner}/{bay.repo.name}
              {bay.isSelf ? " · forklift itself" : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <span className="stamp text-xs" style={{ color: "var(--amber)" }}>
              Evidence only · not a verdict
            </span>
            {ev ? (
              <div className="flex gap-3">
                <a
                  href={`/api/bays/${bay.id}/export`}
                  className="border border-[var(--line)] px-4 py-2 text-[11px] tracking-[0.18em] text-[var(--fog)] hover:border-[var(--amber)] hover:text-[var(--amber)]"
                >
                  EXPORT JSON
                </a>
                <OpenPreview bayId={bay.id} url={ev.previewUrl ?? ""} />
              </div>
            ) : null}
          </div>
        </div>

        {bay.error ? (
          <p className="mt-6 border border-[var(--bad)] p-4 text-sm text-[var(--bad)]">{bay.error}</p>
        ) : null}

        {!ev ? (
          <p className="mt-10 text-sm text-[var(--mute)]">Still on the lift — this bay is {bay.status}.</p>
        ) : (
          <div className="mt-8 grid gap-5">
            <section className="bezel">
              {bay.hasScreenshot ? (
                <img
                  src={`/api/bays/${bay.id}/screenshot`}
                  alt={`${bay.repo.name} preview screenshot`}
                  className="w-full"
                />
              ) : (
                <p className="p-10 text-center text-sm text-[var(--mute)]">No screenshot captured.</p>
              )}
            </section>

            <div className="grid gap-5 lg:grid-cols-2">
              <Section title="Payload manifest">
                <dl>
                  {(
                    [
                      ["REPO", bay.repo.url, bay.repo.url],
                      ["PREVIEW", ev.previewUrl, ev.previewUrl],
                      ["STACK", ev.manifestUsed ? `${ev.stack} · via forklift.yaml` : ev.stack, undefined],
                      ["BUILD", ev.build.ok ? "ok" : "failed", undefined],
                      [
                        "TESTS",
                        ev.tests.ran ? (ev.tests.ok ? "ok" : "failed") : "none found",
                        undefined,
                      ],
                      ["SECRETS", `${ev.secretsFound.length} found`, undefined],
                    ] as Array<[string, string | null | undefined, string | null | undefined]>
                  ).map(([k, v, href]) => (
                    <div key={k} className="mrow">
                      <dt>{k}</dt>
                      <span className="dots" />
                      <dd>
                        {href ? (
                          <a href={href} className="text-[var(--amber)]">
                            {v}
                          </a>
                        ) : (
                          v
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
                {ev.replayUrl ? (
                  <p className="mt-4 border-t border-[var(--line-soft)] pt-4 text-[11px] text-[var(--mute)]">
                    REPLAY ·{" "}
                    <a href={ev.replayUrl} className="text-[var(--amber)]">
                      watch the recorded browser walkthrough
                    </a>
                  </p>
                ) : null}
              </Section>

              <Section title="Inspection results">
                <ul>
                  {ev.criteria.map((c) => (
                    <Criterion key={c.label} c={c} />
                  ))}
                </ul>
              </Section>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Section title="Solari integration">
                <div className="flex flex-wrap gap-2">
                  <Flag label="SANDBOX" on={ev.solari.sandbox} />
                  <Flag label="BROWSER" on={ev.solari.browser} />
                  <Flag label="RECORDING" on={ev.solari.recording} />
                  <Flag label="DESKTOP" on={ev.solari.desktop} />
                </div>
                {ev.solari.packages.length > 0 ? (
                  <p className="mt-3 text-[11px] text-[var(--mute)]">
                    packages: {ev.solari.packages.join(", ")}
                  </p>
                ) : null}
                {ev.solari.importHits.length > 0 ? (
                  <pre className="term mt-3 max-h-32 p-3">{ev.solari.importHits.slice(0, 12).join("\n")}</pre>
                ) : null}
              </Section>

              <Section title="README check">
                <dl>
                  <div className="mrow">
                    <dt>CLAIMED START</dt>
                    <span className="dots" />
                    <dd>{ev.readme.claimedStart ?? "none"}</dd>
                  </div>
                  <div className="mrow">
                    <dt>START WORKS</dt>
                    <span className="dots" />
                    <dd>{ev.readme.startExists ? "yes" : "no"}</dd>
                  </div>
                  <div className="mrow">
                    <dt>CLAIMED PORT</dt>
                    <span className="dots" />
                    <dd>{ev.readme.claimedPort ?? "none"}</dd>
                  </div>
                  <div className="mrow">
                    <dt>PORT MATCHED</dt>
                    <span className="dots" />
                    <dd>{ev.readme.portMatched ? "yes" : "no"}</dd>
                  </div>
                  <div className="mrow">
                    <dt>MENTIONS SOLARI</dt>
                    <span className="dots" />
                    <dd>{ev.readme.mentionsSolari ? "yes" : "no"}</dd>
                  </div>
                </dl>
              </Section>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Section title={`Console errors · ${ev.consoleErrors.length}`}>
                <pre className="term max-h-64 p-3">
                  {ev.consoleErrors.slice(0, 40).join("\n") || "clean"}
                </pre>
              </Section>
              <Section title={`Network errors · ${ev.networkErrors.length}`}>
                <pre className="term max-h-64 p-3">
                  {ev.networkErrors.slice(0, 40).join("\n") || "clean"}
                </pre>
              </Section>
            </div>

            <Section title="Meaningful changes vs upstream">
              {ev.diff.files.length > 0 ? (
                <div className="text-sm">
                  <p className="mb-3 text-[var(--mute)]">
                    <span style={{ color: "var(--ok)" }}>+{ev.diff.insertions}</span>{" "}
                    <span style={{ color: "var(--bad)" }}>−{ev.diff.deletions}</span> across{" "}
                    {ev.diff.filesChanged} files
                  </p>
                  {ev.diff.newTopLevel.length > 0 ? (
                    <p className="mb-3 text-[11px] tracking-[0.1em] text-[var(--amber)]">
                      NEW TOP-LEVEL: {ev.diff.newTopLevel.join(" · ")}
                    </p>
                  ) : null}
                  <ul>
                    {ev.diff.files.map((f) => (
                      <li
                        key={f.path}
                        className="flex justify-between gap-4 border-b border-[var(--line-soft)] py-1.5 text-[var(--fog)] last:border-none"
                      >
                        <span className="min-w-0 truncate">{f.path}</span>
                        <span className="flex-none text-[10px] tracking-[0.15em] uppercase text-[var(--mute)]">
                          {f.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-[var(--mute)]">No diff recorded.</p>
              )}
            </Section>

            <Section title="Bay log">
              <pre className="term max-h-72 p-3">{bay.logs.join("\n") || "quiet"}</pre>
            </Section>
          </div>
        )}
      </div>
      <div className="hazard" />
    </main>
  );
}
