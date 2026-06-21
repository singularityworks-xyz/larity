import { cx } from "../../lib/ui";

interface CommitmentCounterProps {
  className?: string;
  contradictionCount: number;
  externalCount: number;
  teamCount: number;
}

export function CommitmentCounter({
  teamCount,
  externalCount,
  contradictionCount,
  className,
}: CommitmentCounterProps) {
  const total = teamCount + externalCount;
  if (total === 0 && contradictionCount === 0) {
    return null;
  }

  return (
    <output
      aria-label={`${teamCount} team commitments, ${externalCount} external commitments${contradictionCount > 0 ? `, ${contradictionCount} contradictions` : ""}`}
      className={cx(
        "inline-flex h-[20px] shrink-0 items-stretch overflow-hidden rounded-[5px] border font-medium font-mono text-[10px] tabular-nums leading-none",
        contradictionCount > 0 ? "border-danger-fg/20" : "border-border-subtle",
        className
      )}
    >
      {teamCount > 0 ? (
        <span className="inline-flex items-center gap-1 bg-accent-subtle/60 px-1.5 text-accent">
          <span
            aria-hidden
            className="inline-block h-1 w-1 rounded-full bg-accent"
          />
          {teamCount}
        </span>
      ) : null}
      {externalCount > 0 ? (
        <span className="inline-flex items-center gap-1 border-border-subtle bg-bg-subtle/80 px-1.5 text-fg-muted last:border-l-0">
          {teamCount > 0 && (
            <span aria-hidden className="border-border-subtle border-l" />
          )}
          <span
            aria-hidden
            className="inline-block h-1 w-1 rounded-full bg-fg-muted/60"
          />
          {externalCount}
        </span>
      ) : null}
      {contradictionCount > 0 ? (
        <span className="inline-flex animate-[contradiction-flash_1.5s_ease-out] items-center gap-1 border-danger-fg/10 bg-danger-bg/50 px-1.5 text-danger-fg">
          {teamCount > 0 || externalCount > 0 ? (
            <span aria-hidden className="border-danger-fg/10 border-l" />
          ) : null}
          <span
            aria-hidden
            className="inline-block h-1 w-1 rounded-full bg-danger-fg"
          />
          {contradictionCount}
        </span>
      ) : null}
    </output>
  );
}
