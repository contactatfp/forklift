export function DryRunNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className="notice" role="status">
      <b>DRY RUN</b>
      <p className={compact ? "mt-1" : "mt-1 max-w-3xl"}>
        No Solari key on this deploy, so nothing was cloned, installed, built, or recorded.
        Fork names and GitHub ahead-by counts are real. Every other field reads <i>not measured</i>.
        Set <code>SOLARI_API_KEY</code> to run the floor for real.
      </p>
    </div>
  );
}
