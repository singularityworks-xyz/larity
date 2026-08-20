import type { OpenCommitmentItem } from "../../features/home/types";
import { CONTROL_URL } from "../../lib/env";
import { panelClass } from "../../lib/ui";

interface OpenCommitmentsProps {
  commitments: OpenCommitmentItem[];
  loading: boolean;
}

function renderContent(commitments: OpenCommitmentItem[], loading: boolean) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <div
            className="flex animate-pulse items-center gap-3 rounded-lg py-1.5"
            key={`oc-sk-${i}`}
          >
            <div className="h-3 w-16 rounded-sm bg-bg-subtle" />
            <div className="h-3 flex-1 rounded-sm bg-bg-subtle" />
          </div>
        ))}
      </div>
    );
  }

  if (commitments.length === 0) {
    return (
      <p className="py-1 text-[11.5px] text-fg-muted leading-relaxed">
        No open commitments
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {commitments.map((c) => (
        <li key={c.id}>
          <div className="flex items-center gap-3 rounded-lg px-1.5 py-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span className="min-w-0 truncate font-medium text-[12.5px] text-fg leading-snug">
              {c.content}
            </span>
            <span className="ml-auto shrink-0 rounded-full border border-border bg-bg-overlay px-2 py-0.5 font-medium text-[10px] text-fg-muted leading-snug">
              {c.client.name}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function OpenCommitments({
  commitments,
  loading,
}: OpenCommitmentsProps) {
  return (
    <div className={panelClass}>
      <div className="mb-2.5 flex items-center justify-between">
        <p className="font-medium text-[11px] text-text-tertiary uppercase leading-none tracking-[0.06em]">
          Open Commitments
        </p>
        {!loading && commitments.length > 0 ? (
          <span className="font-medium text-[10.5px] text-fg-subtle leading-none">
            <a
              className="transition-colors duration-150 ease-out hover:text-fg-muted"
              href={`${CONTROL_URL}/web/commitments`}
              rel="noopener noreferrer"
              target="_blank"
            >
              View all &rarr;
            </a>
          </span>
        ) : null}
      </div>
      {renderContent(commitments, loading)}
    </div>
  );
}
