import { useEffect, useRef, useState } from "react";
import { cx } from "../../lib/ui";
import type { OverlaySpeaker, OverlayTeammate } from "./types";
import { VoiceDotMatrix } from "./voice-dot-matrix";

const MAX_VISIBLE_TEAMMATES = 4;

function HeartbeatDot() {
  return (
    <output
      aria-label="Audio processing active"
      className="relative inline-flex h-[7px] w-[7px] shrink-0 items-center justify-center"
    >
      <span className="absolute inline-block h-full w-full animate-[speak-ring_2.2s_ease-out_infinite] rounded-full bg-[hsl(var(--grad-hue,252)_70%_55%)/0.45]" />
      <span className="relative inline-block h-[7px] w-[7px] rounded-full bg-[hsl(var(--grad-hue,252)_70%_60%)]" />
    </output>
  );
}

function AnimatedTopicLabel({ topic }: { topic: string | null }) {
  const [displayed, setDisplayed] = useState(topic);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (topic !== displayed) {
      setKey((k) => k + 1);
      setDisplayed(topic);
    }
  }, [topic, displayed]);

  return (
    <span
      className="min-w-0 flex-1 overflow-hidden"
      key={key}
      style={{
        animation: "topic-enter 250ms cubic-bezier(0.2, 0, 0, 1) both",
      }}
    >
      <span className="block truncate font-medium text-[11px] text-fg">
        {displayed ?? "Listening…"}
      </span>
    </span>
  );
}

function ConstraintBadge({ count }: { count: number }) {
  const [flash, setFlash] = useState(false);
  const prevCountRef = useRef(count);

  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = count;
    if (prev < count && count > 0) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 400);
      return () => clearTimeout(timer);
    }
  }, [count]);

  if (count === 0) {
    return null;
  }
  return (
    <span
      className={cx(
        "inline-flex h-[18px] shrink-0 items-center rounded-[3px] border border-warning-fg/25 bg-warning-bg px-1.5 font-medium font-mono text-[10px] text-warning-fg tabular-nums leading-none",
        flash && "animate-[counter-flash_400ms_ease-out]"
      )}
    >
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

  return (
    <span className="inline-flex items-center gap-[6px]">
      <span
        aria-hidden="true"
        className="inline-block h-[5px] w-[5px] shrink-0 rounded-[1px] bg-[hsl(var(--grad-hue,252)_70%_60%)]"
      />
      <span className="truncate font-medium text-[11px] text-fg">
        {speaker.name}
      </span>
      <span className="inline-flex h-[16px] items-center rounded-[3px] border border-border bg-bg-subtle px-[5px] font-semibold text-[9px] text-fg-muted">
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
    <span className="inline-flex items-center -space-x-1">
      {visible.map((t) => (
        <span
          className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border-[#0E0E0E] border-[1.5px] bg-bg-subtle font-semibold text-[8px] text-fg-muted"
          key={t.id}
          title={t.name}
        >
          {t.initials}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border-[#0E0E0E] border-[1.5px] bg-bg-emphasis font-medium text-[8px] text-fg-subtle">
          +{overflow}
        </span>
      ) : null}
    </span>
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
    <div className="relative flex w-full flex-col gap-2.5 px-3.5 pt-3 pb-2.5">
      <div className="flex w-full min-w-0 items-center gap-2">
        <HeartbeatDot />
        <AnimatedTopicLabel topic={currentTopic} />
        <ConstraintBadge count={constraintCount} />
        <TeammateAvatars teammates={connectedTeammates} />
      </div>
      <div className="flex w-full min-w-0 items-center gap-2.5">
        <VoiceDotMatrix isSpeaking={isMicActive} />
        <SpeakerIndicator speaker={currentSpeaker} />
      </div>
      {/* Bottom separator — gradient mask instead of border */}
      <div
        className="absolute right-0 bottom-0 left-0 h-[1px]"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.06) 80%, transparent 100%)",
        }}
      />
    </div>
  );
}
