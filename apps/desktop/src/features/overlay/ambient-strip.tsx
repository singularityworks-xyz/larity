import { Mic, MicOff } from "lucide-react";
import { cx } from "../../lib/ui";
import type { OverlaySpeaker, OverlayTeammate } from "./types";

const MAX_VISIBLE_TEAMMATES = 4;

function HeartbeatDot() {
  return (
    <output
      aria-label="Audio processing active"
      className="relative inline-flex h-[7px] w-[7px] shrink-0 items-center justify-center"
    >
      <span className="absolute inline-block h-full w-full animate-[overlayHeartbeat_2s_ease-in-out_infinite] rounded-full bg-success-fg/40" />
      <span className="relative inline-block h-[7px] w-[7px] rounded-full bg-success-fg" />
    </output>
  );
}

function TopicLabel({ topic }: { topic: string | null }) {
  return (
    <span
      className={cx(
        "min-w-0 flex-1 truncate font-medium text-fg text-xs transition-opacity duration-300",
        topic ? "opacity-100" : "opacity-40"
      )}
    >
      {topic ?? "Listening\u2026"}
    </span>
  );
}

function ConstraintBadge({ count }: { count: number }) {
  if (count === 0) {
    return null;
  }
  return (
    <span className="inline-flex h-[18px] shrink-0 items-center rounded-[4px] border border-warning-fg/20 bg-warning-bg px-1.5 font-medium font-mono text-[10px] text-warning-fg tabular-nums leading-none">
      {count}
    </span>
  );
}

function SpeakerIndicator({ speaker }: { speaker: OverlaySpeaker | null }) {
  if (!speaker) {
    return (
      <span className="font-medium text-[11px] text-fg-subtle">
        No speaker yet
      </span>
    );
  }

  const badgeClass =
    speaker.type === "TEAM"
      ? "border-0 bg-accent-subtle text-accent"
      : "border border-border-strong bg-transparent text-fg-muted";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="truncate font-medium text-[11px] text-fg">
        {speaker.name}
      </span>
      <span
        className={cx(
          "inline-flex h-[16px] items-center rounded-[3px] px-1 font-medium text-[9px] leading-none",
          badgeClass
        )}
      >
        {speaker.type}
      </span>
    </span>
  );
}

function TeammateAvatars({ teammates }: { teammates: OverlayTeammate[] }) {
  if (teammates.length === 0) {
    return null;
  }

  const visible = teammates.slice(0, MAX_VISIBLE_TEAMMATES);
  const overflow = teammates.length - MAX_VISIBLE_TEAMMATES;

  return (
    <span className="inline-flex items-center -space-x-1.5">
      {visible.map((t) => (
        <span
          className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[#08080a] bg-bg-subtle font-semibold text-[8px] text-fg-muted"
          key={t.id}
          title={t.name}
        >
          {t.initials}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[#08080a] bg-bg-emphasis font-medium text-[8px] text-fg-subtle">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

function MicIndicator({ isSpeaking }: { isSpeaking: boolean }) {
  return isSpeaking ? (
    <Mic
      aria-label="You are speaking"
      className="h-3.5 w-3.5 text-success-fg"
      strokeWidth={1.5}
    />
  ) : (
    <MicOff
      aria-label="Microphone silent"
      className="h-3.5 w-3.5 text-fg-subtle"
      strokeWidth={1.5}
    />
  );
}

interface AmbientStripProps {
  currentTopic: string | null;
  constraintCount: number;
  currentSpeaker: OverlaySpeaker | null;
  connectedTeammates: OverlayTeammate[];
  isMicActive: boolean;
}

export function AmbientStrip({
  currentTopic,
  constraintCount,
  currentSpeaker,
  connectedTeammates,
  isMicActive,
}: AmbientStripProps) {
  return (
    <div className="flex flex-col gap-2.5 border-white/[0.04] border-b px-3.5 pt-3 pb-2.5">
      <div className="flex items-center gap-2">
        <HeartbeatDot />
        <TopicLabel topic={currentTopic} />
        <ConstraintBadge count={constraintCount} />
      </div>
      <div className="flex items-center gap-2.5">
        <SpeakerIndicator speaker={currentSpeaker} />
        <span className="flex-1" />
        <TeammateAvatars teammates={connectedTeammates} />
        <MicIndicator isSpeaking={isMicActive} />
      </div>
    </div>
  );
}
