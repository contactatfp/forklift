import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/store";
import type { CriterionResult, Evidence } from "@/lib/types";
import { DryRunNotice } from "@/app/dry-run-notice";

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

/** What the applicant shipped: a recorded page, or a program that ran to completion. */
function Artifact({ ev, bayId, hasScreenshot, repoName }: { ev: Evidence; bayId: string; hasScreenshot: boolean; repoName: string }) {
  if (ev.measured === false) {
    return (
      <section className="bezel">
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
    return (
      <section className="bezel">
        <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-3 text-[10px] tracking-[0.2em] text-[var(--mute)]">
          <span>
            $ <span className="text-[var(--fog)]">{s.command}</span>
            {ev.cwd ? <span className="ml-2 opacity-70">in {ev.cwd}</span> : null}
          </span>
          <span style={{ color: s.timedOut || (s.exitCode !== 0 && !s.needsKey) ? "var(--bad)" : s.needsKey ? "var(--amber)" : "var(--ok)" }}>
            {verdict}
          </span>
        </div>
        <pre className="term max-h-[28rem] p-4">{s.transcript || "(no output)"}</pre>
        {s.needsKey ? (
          <p className="px-2 pt-3 text-[11px] leading-5 text-[var(--mute)]">
            This program reads <code>SOLARI_API_KEY</code>. Forklift never hands its own key to guest code, so the
            exit code above is not held against the submission. Run it with your key to judge it.
          </p>
        ) : null}
      </section>
    );
  }
  return (
    <section className="bezel">
      {hasScreenshot ? (
        // eslint-disable-next-line @next/next/no-img-element -- PNG straight out of our own DB, no loader wanted
        <img src={`/api/bays/${bayId}/screenshot`} alt={`${repoName} preview screenshot`} className="w-full" />
      ) : (
        <p className="p-10 text-center text-sm text-[var(--mute)]">
          {!ev.previewUrl
            ? "No start command, so no preview and no screenshot."
            : ev.previewUp === false
              ? "The app started but never answered 200 on its health path. No browser pass. Check the log."
              : "Preview came up but the browser pass left no screenshot."}
        </p>
      )}
    </section>
  );
}

function Criterion({ c }: { c: CriterionResult }) {
  const state = c.kind === "manual" ? "man" : c.met ? "yes" : "no";
  const label = c.kind === "manual" ? "LOOK" : c.met ? "YES" : "NO";
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
  const job = bay.jobId ? await store.getJob(bay.jobId) : null;
  const ev = bay.evidence;
  const summary = ev ? facts(ev) : "";
  const dryRun = Boolean(job?.fixture) || ev?.measured === false;
  const measured = Boolean(ev) && !dryRun;
  const nm = "not measured";

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
              ← FLOOR
            </Link>
            <h1 className="stencil mt-3 text-5xl text-[#f3ead8]">
              BAY {String(bay.bay).padStart(2, "0")}
            </h1>
            <p className="mt-2 text-sm text-[var(--fog)]">
              {bay.repo.owner}/{bay.repo.name}
              {bay.isSelf ? " · this app" : ""}
            </p>
            {summary ? (
              <p className="mt-2 text-[11px] tracking-[0.12em] text-[var(--mute)]">{summary}</p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="flex flex-wrap items-center justify-end gap-3">
              {dryRun ? (
                <span className="stamp text-xs" style={{ color: "var(--amber)" }}>
                  DRY RUN
                </span>
              ) : null}
              <span className="stamp text-[10px]" style={{ color: "var(--mute)", transform: "rotate(2deg)" }}>
                Evidence only · not a verdict
              </span>
            </div>
            {ev ? (
              <div className="flex gap-3">
                <a
                  href={`/api/bays/${bay.id}/export`}
                  className="press border border-[var(--line)] px-4 py-2 text-[11px] tracking-[0.18em] text-[var(--fog)] hover:border-[var(--amber)] hover:text-[var(--amber)]"
                >
                  EXPORT JSON
                </a>
                {ev.browserSessionId || ev.replayUrl ? (
                  <a
                    href={`/api/bays/${bay.id}/replay`}
                    target="_blank"
                    rel="noreferrer"
                    className="press bg-[#e3a008] px-4 py-2 text-[11px] tracking-widest text-[#121416]"
                  >
                    WATCH REPLAY
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {dryRun ? (
          <div className="mt-6">
            <DryRunNotice />
          </div>
        ) : null}

        {bay.isSelf && measured ? (
          <p className="mt-6 text-[11px] leading-5 text-[var(--mute)]">
            Self-review: the Forklift inside this sandbox ran without a Solari key, so the recording shows its UI in
            dry run. The live evidence for Forklift is the floor you just came from.
          </p>
        ) : null}

        {bay.error ? (
          <p className="mt-6 border border-[var(--bad)] p-4 text-sm text-[var(--bad)]">{bay.error}</p>
        ) : null}

        {!ev ? (
          <p className="mt-10 text-sm text-[var(--mute)]">Still {bay.status}.</p>
        ) : (
          <div className="mt-8 grid gap-5">
            <Artifact ev={ev} bayId={bay.id} hasScreenshot={bay.hasScreenshot} repoName={bay.repo.name} />

            <div className="grid gap-5 lg:grid-cols-2">
              <Section title="Run">
                <dl>
                  {(
                    [
                      ["REPO", bay.repo.url, bay.repo.url],
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
                {ev.browserSessionId || ev.replayUrl ? (
                  <p className="mt-4 border-t border-[var(--line-soft)] pt-4 text-[11px] text-[var(--mute)]">
                    <a href={`/api/bays/${bay.id}/replay`} className="text-[var(--amber)]">
                      Watch recording →
                    </a>
                    {ev.browserSessionId ? <span className="ml-2 opacity-70">session {ev.browserSessionId.slice(-12)}</span> : null}
                  </p>
                ) : null}
              </Section>

              <Section title="Criteria">
                <ul>
                  {ev.criteria.map((c) => (
                    <Criterion key={c.label} c={c} />
                  ))}
                </ul>
              </Section>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
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
                  <p className="mt-3 text-[11px] text-[var(--mute)]">
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
                    <span className="dots" />
                    <dd>{ev.readme.claimedStart ?? "none"}</dd>
                  </div>
                  <div className="mrow">
                    <dt>FOUND</dt>
                    <span className="dots" />
                    <dd>{ev.readme.startExists ? "yes" : "no"}</dd>
                  </div>
                  <div className="mrow">
                    <dt>PORT</dt>
                    <span className="dots" />
                    <dd>{ev.readme.claimedPort ?? "none"}</dd>
                  </div>
                  <div className="mrow">
                    <dt>MATCHES</dt>
                    <span className="dots" />
                    <dd>{ev.readme.portMatched ? "yes" : "no"}</dd>
                  </div>
                  <div className="mrow">
                    <dt>NAMES SOLARI</dt>
                    <span className="dots" />
                    <dd>{ev.readme.mentionsSolari ? "yes" : "no"}</dd>
                  </div>
                </dl>
                )}
              </Section>
            </div>

            {measured && ev.kind !== "script" ? (
              <div className="grid gap-5 lg:grid-cols-2">
                <Section title={`Console · ${ev.consoleErrors.length}`}>
                  <pre className="term max-h-64 p-3">
                    {ev.consoleErrors.slice(0, 40).join("\n") || (ev.previewUrl ? "clean" : "no browser pass")}
                  </pre>
                </Section>
                <Section title={`Network · ${ev.networkErrors.length}`}>
                  <pre className="term max-h-64 p-3">
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
                <p className="text-sm text-[var(--mute)]">{measured ? "No diff against upstream." : "Not measured."}</p>
              )}
            </Section>

            <Section title="Log">
              <pre className="term max-h-72 p-3">{bay.logs.join("\n") || "quiet"}</pre>
            </Section>
          </div>
        )}
      </div>
      <div className="hazard" />
    </main>
  );
}
