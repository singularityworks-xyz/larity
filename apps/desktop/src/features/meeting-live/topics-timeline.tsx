import { useMemo } from "react";
import { cx } from "../../lib/ui";
import type { LiveTopic } from "./types";

function formatOffset(meetingStartMs: number, topicStartMs: number): string {
  const delta = Math.max(0, topicStartMs - meetingStartMs);
  const totalSec = Math.floor(delta / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface TopicsTimelineProps {
  topics: LiveTopic[];
  meetingStartedAtMs: number;
  activeTopicId: string | null;
  onSelectTopic: (topic: LiveTopic) => void;
}

function TopicSegment({
  topic,
  isActive,
  style,
  meetingStartedAtMs,
  onClick,
}: {
  topic: LiveTopic;
  isActive: boolean;
  style: React.CSSProperties;
  meetingStartedAtMs: number;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={isActive}
      className={cx(
        "group relative flex shrink-0 flex-col justify-center overflow-hidden border-border-subtle border-r px-3 py-0",
        "transition-colors duration-150",
        "last:border-r-0",
        isActive
          ? "bg-accent-subtle/40 hover:bg-accent-subtle/60"
          : "hover:bg-bg-subtle"
      )}
      onClick={onClick}
      style={style}
      type="button"
    >
      {isActive && (
        <span className="absolute inset-x-0 bottom-0 h-[2px] bg-accent/80" />
      )}

      <span
        className={cx(
          "relative truncate font-medium text-[11px] transition-colors",
          isActive ? "text-fg" : "text-fg-muted"
        )}
      >
        {topic.label}
      </span>
      <span className="relative font-mono text-[9px] text-fg-subtle tabular-nums">
        +{formatOffset(meetingStartedAtMs, topic.startedAt)}
      </span>
    </button>
  );
}

export function TopicsTimeline({
  topics,
  meetingStartedAtMs,
  activeTopicId,
  onSelectTopic,
}: TopicsTimelineProps) {
  const segments = useMemo(() => {
    if (topics.length === 0) {
      return [];
    }

    // biome-ignore lint/style/useAtIndex: .at(-1) returns undefined, tsc rejects it
    const now = topics[topics.length - 1].startedAt;
    const totalElapsed = Math.max(1, now - meetingStartedAtMs);

    return topics.map((topic, i) => {
      const start = topic.startedAt - meetingStartedAtMs;
      const end =
        i < topics.length - 1
          ? topics[i + 1].startedAt - meetingStartedAtMs
          : totalElapsed;
      const duration = Math.max(0, end - start);
      const proportion =
        totalElapsed > 0 ? duration / totalElapsed : 1 / topics.length;
      return {
        topic,
        flexGrow: proportion,
        minWidth: "80px",
        maxWidth: "220px",
      };
    });
  }, [topics, meetingStartedAtMs]);

  if (segments.length === 0) {
    return (
      <div className="flex h-10 items-center border-border border-b bg-bg-elevated px-4">
        <span className="font-medium text-[10px] text-fg-subtle/50">
          Topic segments will appear as the conversation shifts…
        </span>
      </div>
    );
  }

  return (
    <div className="scrollbar-none sticky top-[96px] z-[18] flex h-10 shrink-0 items-stretch gap-0 overflow-x-auto border-border border-b bg-bg-elevated">
      {segments.map((s) => (
        <TopicSegment
          isActive={s.topic.id === activeTopicId}
          key={s.topic.id}
          meetingStartedAtMs={meetingStartedAtMs}
          onClick={() => onSelectTopic(s.topic)}
          style={{
            flexGrow: s.flexGrow,
            minWidth: s.minWidth,
            maxWidth: s.maxWidth,
          }}
          topic={s.topic}
        />
      ))}
    </div>
  );
}
