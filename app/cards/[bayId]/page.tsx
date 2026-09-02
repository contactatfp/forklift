import Link from "next/link";
import { notFound } from "next/navigation";
import { CriterionRow, InspectShot, ShotBezel } from "@/app/cards/[bayId]/inspect-shot";
import { DryRunNotice } from "@/app/dry-run-notice";
import { getStore } from "@/lib/store";
import type { Evidence } from "@/lib/types";

function shotEmptyReason(ev: Evidence): string {
  if (ev.kind === "script") return "This bay ran a script. There is no page screenshot — read the transcript.";
  if (!ev.previewUrl) return "No start command, so no preview and no screenshot.";
  if (ev.previewUp === false) {
    return "The app started but never answered 200 on its health path. No browser pass. Check the log.";
  }
  return "Preview came up but the browser pass left no screenshot.";
}

function facts(ev: Evidence): string {
  if (ev.measured === false) {
    return ev.diff.filesChanged ? `not measured · ${ev.diff.filesChanged} files changed on GitHub` : "not measured";
  }
  const auto = ev.criteria.filter((c) => c.kind === "auto");
  const yes = auto.filter((c) => c.met).length;
  const look = ev.criteria.filter((c) => c.kind === "manual").length;
  const bits: string[] = [];
  if (auto.length) bits.push(`${yes}/${auto.length} checks`);
  if (look) bits.push(`${look} to look at`);
  if (ev.diff.filesChanged) bits.push(`${ev.diff.filesChanged} files`);
  if (ev.kind === "script") bits.push("script");
  return bits.join(" · ");
}

function shortRepo(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, "").replace(/\.git$/, "") || url;
  } catch {
    return url.replace(/^https?:\/\/github\.com\//, "");
  }
}

/** What the applicant shipped: a recorded page, or a program that ran to completion. */
function Artifact({
  ev,
  bayId,
  hasScreenshot,
  repoName,
}: {
  ev: Evidence;
  bayId: string;
  hasScreenshot: boolean;
  repoName: string;
}) {
  if (ev.measured === false) {
    return (
      <section className="bezel crt">
        <div className="crt-bar">
          <span>MONITOR</span>
          <span>DRY · NO SIGNAL</span>
        </div>
        <p className="p-10 text-center text-sm text-[var(--mute)]">Dry run. No sandbox, no browser, no artifact.</p>
      </section>
    );
  }

  if (ev.kind === "script" && ev.script) {
    const s = ev.script;
    const verdict = s.timedOut
      ? "TIMED OUT"
      : s.needsKey
        ? `EXIT ${s.exitCode ?? "?"} · NOT JUDGED`
        : `EXIT ${s.exitCode ?? "?"}`;
    const tone = s.timedOut || (s.exitCode !== 0 && !s.needsKey) ? "bad" : s.needsKey ? "amber" : "ok";
    return (
      <section id="artifact" className="bezel crt">
        <div className="crt-bar">
          <span className="min-w-0 truncate">
            $ <span className="text-[var(--fog)]">{s.command}</span>
            {ev.cwd ? <span className="opacity-60"> · {ev.cwd}</span> : null}
          </span>
          <span className="flex-none" style={{ color: `var(--${tone})` }}>
            {verdict}
          </span>
        </div>
        <pre className="term crt-body">{s.transcript || "(no output)"}</pre>
        {s.needsKey ? (
          <p className="crt-note">
            This program reads <code>SOLARI_API_KEY</code>. Forklift never hands its own key to guest code, so the
            exit code above is not held against the submission. Run it with your key to judge it.
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <ShotBezel
      src={`/api/bays/${bayId}/screenshot`}
      alt={`${repoName} preview screenshot`}
      hasScreenshot={hasScreenshot}
      emptyReason={shotEmptyReason(ev)}
    />
  );
}

function Flag({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className="border px-2 py-1 text-[10px] tracking-[0.15em]"
      style={{
        color: on ? "var(--ok)" : "var(--mute)",
        borderColor: on ? "var(--ok)" : "var(--line)",
        opacity: on ? 1 : 0.55,
      }}
    >
      {label}
    </span>
  );
}

function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`plate rivets card-plate min-w-0 ${className}`}>
      <h2 className="stencil text-sm text-[var(--amber)]">{title}</h2>
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  );
}

export default async function CardPage({ params }: { params: Promise<{ bayId: string }> }) {
  const { bayId } = await params;
  const store = await getStore();
  const bay = await store.getBay(bayId);
  if (!bay) notFound();
  const job = bay.jobId ? await store.getJob(bay.jobId) : null;
  const ev = bay.evidence;
  const summary = ev ? facts(ev) : "";
  const dryRun = Boolean(job?.fixture) || ev?.measured === false;
  const measured = Boolean(ev) && !dryRun;
  const nm = "not measured";

  return (
    <main className="flex min-h-svh flex-col overflow-x-clip">
      <div className="hazard" />
      <div className="card-shell mx-auto w-full flex-1 px-4 py-8 sm:px-6">
        <header className="card-mast">
          <div className="min-w-0">
            <Link
              href={bay.jobId ? `/floor/${bay.jobId}` : "/"}
              className="text-[10px] tracking-[0.3em] text-[var(--mute)] hover:text-[var(--amber)]"
            >
              ← FLOOR
            </Link>
            <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
              <h1 className="stencil text-4xl leading-none text-[#f3ead8] sm:text-5xl">
                BAY {String(bay.bay).padStart(2, "0")}
              </h1>
              {dryRun ? (
                <span className="stamp text-xs" style={{ color: "var(--amber)" }}>
                  DRY RUN
                </span>
              ) : (
                <span
                  className="stamp max-w-full text-center text-[10px] leading-snug"
                  style={{ color: "var(--mute)", transform: "rotate(2deg)" }}
                >
                  Evidence only · not a verdict
                </span>
              )}
            </div>
            <p className="mt-2 truncate text-sm text-[var(--fog)]" title={`${bay.repo.owner}/${bay.repo.name}`}>
              {bay.repo.owner}/{bay.repo.name}
              {bay.isSelf ? " · this app" : ""}
            </p>
            {summary ? (
              <p className="mt-1 text-[11px] tracking-[0.12em] text-[var(--mute)]">{summary}</p>
            ) : null}
          </div>

          {ev ? (
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <a
                href={`/api/bays/${bay.id}/export`}
                className="press border border-[var(--line)] px-3 py-2 text-[11px] tracking-[0.18em] text-[var(--fog)] hover:border-[var(--amber)] hover:text-[var(--amber)]"
              >
                EXPORT JSON
              </a>
              {ev.browserSessionId || ev.replayUrl ? (
                <Link
                  href={`/replay/${bay.id}`}
                  className="press bg-[var(--amber)] px-3 py-2 text-[11px] tracking-widest text-[#121416] hover:bg-[var(--amber-deep)] hover:text-[#f3ead8]"
                >
                  WATCH REPLAY
                </Link>
              ) : null}
            </div>
          ) : null}
        </header>

        {dryRun ? (
          <div className="mt-5">
            <DryRunNotice />
          </div>
        ) : null}

        {bay.isSelf && measured ? (
          <p className="mt-5 text-[11px] leading-5 text-[var(--mute)]">
            Self-review: the Forklift inside this sandbox ran without a Solari key, so the recording shows its UI in
            dry run. The live evidence for Forklift is the floor you just came from.
          </p>
        ) : null}

        {bay.error ? (
          <p className="mt-5 break-words border border-[var(--bad)] p-4 text-sm text-[var(--bad)]">{bay.error}</p>
        ) : null}

        {!ev ? (
          <p className="mt-10 text-sm text-[var(--mute)]">Still {bay.status}.</p>
        ) : (
          <InspectShot
            bayId={bay.id}
            repoName={bay.repo.name}
            hasScreenshot={bay.hasScreenshot}
            emptyReason={shotEmptyReason(ev)}
          >
          <div className="card-stack mt-6">
            <Artifact ev={ev} bayId={bay.id} hasScreenshot={bay.hasScreenshot} repoName={bay.repo.name} />

            <div className="card-split">
              <Section title="Criteria">
                <ul>
                  {ev.criteria.map((c) => (
                    <CriterionRow key={c.label} c={c} />
                  ))}
                </ul>
              </Section>

              <Section title="Run">
                <dl>
                  {(
                    [
                      ["REPO", shortRepo(bay.repo.url), bay.repo.url],
                      ["AHEAD", bay.repo.aheadBy != null ? `${bay.repo.aheadBy} commits` : null, undefined],
                      ["MODE", measured ? (ev.kind ?? "server") + (ev.cwd ? ` · ${ev.cwd}` : "") : nm, undefined],
                      [
                        "PREVIEW",
                        measured
                          ? ev.previewUrl
                            ? ev.previewUp === false
                              ? "started, never answered"
                              : "answered 200 (sandbox since closed)"
                            : "none"
                          : nm,
                        undefined,
                      ],
                      ["STACK", measured ? (ev.manifestUsed ? `${ev.stack} · forklift.yaml` : ev.stack) : nm, undefined],
                      ["BUILD", measured ? (ev.build.ok ? "ok" : "failed") : nm, undefined],
                      ["TESTS", measured ? (ev.tests.ran ? (ev.tests.ok ? "ok" : "failed") : "none") : nm, undefined],
                      ["SECRETS", measured ? (ev.secretsFound.length ? String(ev.secretsFound.length) : "none") : nm, undefined],
                    ] as Array<[string, string | null | undefined, string | null | undefined]>
                  )
                    .filter(([, v]) => v !== null && v !== undefined)
                    .map(([k, v, href]) => (
                      <div key={k} className="mrow">
                        <dt>{k}</dt>
                        <span className="dots" aria-hidden />
                        <dd title={href || v || undefined}>
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
                {ev.browserSessionId || ev.replayUrl ? (
                  <p className="mt-4 border-t border-[var(--line-soft)] pt-4 text-[11px] text-[var(--mute)]">
                    <Link href={`/replay/${bay.id}`} className="text-[var(--amber)]">
                      Watch recording →
                    </Link>
                    {ev.browserSessionId ? (
                      <span className="ml-2 opacity-70">session {ev.browserSessionId.slice(-12)}</span>
                    ) : null}
                  </p>
                ) : null}
              </Section>
            </div>

            <div className="card-split">
              <Section title="Solari">
                {measured || bay.isSelf ? (
                  <div className="flex flex-wrap gap-2">
                    <Flag label="SANDBOX" on={ev.solari.sandbox} />
                    <Flag label="BROWSER" on={ev.solari.browser} />
                    <Flag label="RECORDING" on={ev.solari.recording} />
                    <Flag label="DESKTOP" on={ev.solari.desktop} />
                  </div>
                ) : (
                  <p className="text-sm text-[var(--mute)]">Source not scanned in a dry run.</p>
                )}
                {ev.solari.packages.length > 0 ? (
                  <p className="mt-3 break-words text-[11px] text-[var(--mute)]">
                    packages: {ev.solari.packages.join(", ")}
                  </p>
                ) : null}
                {ev.solari.importHits.length > 0 ? (
                  <pre className="term mt-3 max-h-32 p-3">{ev.solari.importHits.slice(0, 12).join("\n")}</pre>
                ) : null}
              </Section>

              <Section title="README">
                {!measured && !bay.isSelf ? (
                  <p className="text-sm text-[var(--mute)]">Not read in a dry run.</p>
                ) : (
                  <dl>
                    <div className="mrow">
                      <dt>START</dt>
                      <span className="dots" aria-hidden />
                      <dd>{ev.readme.claimedStart ?? "none"}</dd>
                    </div>
                    <div className="mrow">
                      <dt>FOUND</dt>
                      <span className="dots" aria-hidden />
                      <dd>{ev.readme.startExists ? "yes" : "no"}</dd>
                    </div>
                    <div className="mrow">
                      <dt>PORT</dt>
                      <span className="dots" aria-hidden />
                      <dd>{ev.readme.claimedPort ?? "none"}</dd>
                    </div>
                    <div className="mrow">
                      <dt>MATCHES</dt>
                      <span className="dots" aria-hidden />
                      <dd>{ev.readme.portMatched ? "yes" : "no"}</dd>
                    </div>
                    <div className="mrow">
                      <dt>NAMES SOLARI</dt>
                      <span className="dots" aria-hidden />
                      <dd>{ev.readme.mentionsSolari ? "yes" : "no"}</dd>
                    </div>
                  </dl>
                )}
              </Section>
            </div>

            {measured && ev.kind !== "script" ? (
              <div className="card-split">
                <Section title={`Console · ${ev.consoleErrors.length}`}>
                  <pre className="term max-h-56 p-3">
                    {ev.consoleErrors.slice(0, 40).join("\n") || (ev.previewUrl ? "clean" : "no browser pass")}
                  </pre>
                </Section>
                <Section title={`Network · ${ev.networkErrors.length}`}>
                  <pre className="term max-h-56 p-3">
                    {ev.networkErrors.slice(0, 40).join("\n") || (ev.previewUrl ? "clean" : "no browser pass")}
                  </pre>
                </Section>
              </div>
            ) : null}

            <Section title="Diff">
              {!measured && ev.diff.filesChanged > 0 ? (
                <p className="text-sm text-[var(--mute)]">
                  GitHub compare: {ev.diff.filesChanged} files changed
                  {bay.repo.aheadBy != null ? `, ${bay.repo.aheadBy} commits ahead of upstream` : ""}. Contents not
                  fetched in a dry run.
                </p>
              ) : ev.diff.files.length > 0 ? (
                <div className="min-w-0 text-sm">
                  <p className="mb-3 text-[var(--mute)]">
                    <span style={{ color: "var(--ok)" }}>+{ev.diff.insertions}</span>{" "}
                    <span style={{ color: "var(--bad)" }}>−{ev.diff.deletions}</span> across {ev.diff.filesChanged}{" "}
                    files
                  </p>
                  {ev.diff.newTopLevel.length > 0 ? (
                    <p className="mb-3 break-words text-[11px] tracking-[0.1em] text-[var(--amber)]">
                      NEW TOP-LEVEL: {ev.diff.newTopLevel.join(" · ")}
                    </p>
                  ) : null}
                  <ul className="diff-list">
                    {ev.diff.files.map((f) => (
                      <li key={f.path} className="diff-row">
                        <span className="min-w-0 truncate" title={f.path}>
                          {f.path}
                        </span>
                        <span className="flex-none text-[10px] tracking-[0.15em] uppercase text-[var(--mute)]">
                          {f.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-[var(--mute)]">{measured ? "No diff against upstream." : "Not measured."}</p>
              )}
            </Section>

            <Section title="Log">
              <pre className="term max-h-64 p-3">{bay.logs.join("\n") || "quiet"}</pre>
            </Section>
          </div>
          </InspectShot>
        )}
      </div>
      <div className="hazard" />
    </main>
  );
}
