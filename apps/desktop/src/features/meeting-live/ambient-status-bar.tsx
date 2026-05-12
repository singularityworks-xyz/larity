import { cx } from "../../lib/ui";
import { CommitmentCounter } from "./commitment-counter";
import { ConstraintCounter } from "./constraint-counter";
import { ListeningHeartbeat } from "./listening-heartbeat";
import { ParticipantAvatars } from "./participant-avatars";
import { TopicIndicator } from "./topic-indicator";
import type { LiveParticipant } from "./types";

interface AmbientStatusBarProps {
  isStreamActive: boolean;
  currentTopic: string | null;
  constraintCount: number;
  teamCommitmentCount: number;
  externalCommitmentCount: number;
  contradictionCount: number;
  participants: LiveParticipant[];
  className?: string;
}

export function AmbientStatusBar({
  isStreamActive,
  currentTopic,
  constraintCount,
  teamCommitmentCount,
  externalCommitmentCount,
  contradictionCount,
  participants,
  className,
}: AmbientStatusBarProps) {
  return (
    <output
      aria-label="Meeting ambient status"
      className={cx(
        "flex animate-[status-bar-slide-in_0.3s_cubic-bezier(0.16,1,0.3,1)] items-center gap-3 border-border-subtle border-b bg-bg-elevated/80 px-4 py-2.5 backdrop-blur-sm",
        className
      )}
    >
      <ListeningHeartbeat isActive={isStreamActive} />

      <span aria-hidden className="h-3 w-px shrink-0 bg-border-subtle" />

      <TopicIndicator topic={currentTopic} />

      <div className="flex shrink-0 items-center gap-2">
        <ConstraintCounter count={constraintCount} />
        <CommitmentCounter
          contradictionCount={contradictionCount}
          externalCount={externalCommitmentCount}
          teamCount={teamCommitmentCount}
        />
      </div>

      <span aria-hidden className="h-3 w-px shrink-0 bg-border-subtle" />

      <ParticipantAvatars participants={participants} />
    </output>
  );
}
