import {
  CheckSquare,
  GitBranch,
  type LucideIcon,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "../../lib/ui";
import { ParticipantAvatars } from "./participant-avatars";
import type { LiveParticipant } from "./types";

function TopicChip({ topic }: { topic: string | null }) {
  const [key, setKey] = useState(0);
  const [displayed, setDisplayed] = useState(topic);

  useEffect(() => {
    if (topic !== displayed) {
      setKey((k) => k + 1);
      setDisplayed(topic);
    }
  }, [topic, displayed]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
      <span
        className="inline-flex min-w-0 items-center gap-1.5 rounded-[4px] bg-bg-subtle/80 px-2 py-1"
        key={key}
        style={{ animation: "topic-enter 250ms cubic-bezier(0.2,0,0,1) both" }}
      >
        <span className="h-2.5 w-[2px] shrink-0 rounded-full bg-accent/60" />
        <span className="truncate font-medium text-[11px] text-fg">
          {displayed ?? "Listening…"}
        </span>
      </span>
    </div>
  );
}

function CounterBadge({
  count,
  icon: Icon,
  colors,
}: {
  count: number;
  icon: LucideIcon;
  colors: string;
}) {
  const [flash, setFlash] = useState(false);
  const [prevCount, setPrevCount] = useState(count);

  useEffect(() => {
    if (count > prevCount) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 400);
      setPrevCount(count);
      return () => clearTimeout(timer);
    }
  }, [count, prevCount]);

  if (count === 0) {
    return null;
  }

  return (
    <span
      className={cx(
        "inline-flex h-[18px] items-center gap-1 rounded-[3px] border px-1.5 font-mono text-[10px] tabular-nums",
        colors,
        flash && "animate-[counter-flash_400ms_ease-out]"
      )}
    >
      <Icon size={9} strokeWidth={2} />
      {count}
    </span>
  );
}

interface AmbientStatusBarProps {
  isStreamActive: boolean;
  currentTopic: string | null;
  constraintCount: number;
  teamCommitmentCount: number;
  externalCommitmentCount: number; // Ignored for badges per spec, or combine?
  contradictionCount: number;
  participants: LiveParticipant[];
  className?: string;
}

export function AmbientStatusBar({
  currentTopic,
  constraintCount,
  teamCommitmentCount,
  contradictionCount,
  participants,
  className,
}: AmbientStatusBarProps) {
  return (
    <output
      aria-label="Meeting ambient status"
      className={cx(
        "ambient-status-bar sticky top-[52px] z-[19] flex h-[44px] items-center gap-3 border-border-subtle border-b px-4",
        className
      )}
      style={{
        background:
          "linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg) 100%)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Replaced ListeningHeartbeat with just the indicator per spec if needed, but the layout says: */}
      {/* ◉  |  [Topic chip]  |  [Constraint badge]  [Commitment badges]  |  [Participant row] */}
      {/* However, the ◉ in the status bar was removed in the spec, wait, it says "◉  |  [Topic chip — animated]" */}
      {/* Actually the live dot is in the title bar now, but maybe it remains here? No, spec says: */}
      {/* "The flat topic text becomes a topic chip" */}
      <span className="flex items-center text-fg-subtle">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-fg-subtle" />
      </span>

      <span aria-hidden className="h-3 w-px shrink-0 bg-border-subtle" />

      <TopicChip topic={currentTopic} />

      <div className="flex shrink-0 items-center gap-1.5">
        <CounterBadge
          colors="border-warning-fg/25 bg-warning-bg text-warning-fg"
          count={constraintCount}
          icon={ShieldAlert}
        />
        <CounterBadge
          colors="border-success-fg/20 bg-success-bg text-success-fg"
          count={teamCommitmentCount}
          icon={CheckSquare}
        />
        <CounterBadge
          colors="border-danger-fg/25 bg-danger-bg text-danger-fg"
          count={contradictionCount}
          icon={GitBranch}
        />
      </div>

      <span aria-hidden className="h-3 w-px shrink-0 bg-border-subtle" />

      <ParticipantAvatars participants={participants} />
    </output>
  );
}
