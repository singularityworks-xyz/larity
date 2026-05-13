import { cx } from "../../lib/ui";
import type { LiveTopic } from "./types";

function formatTopicOffset(
  meetingStartMs: number,
  topicStartMs: number
): string {
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

export function TopicsTimeline({
  topics,
  meetingStartedAtMs,
  activeTopicId,
  onSelectTopic,
}: TopicsTimelineProps) {
  if (topics.length === 0) {
    return (
      <div
        aria-live="polite"
        className="flex h-10 shrink-0 items-center border-border border-b bg-bg-elevated px-3 text-fg-muted text-xs"
      >
        Topics appear as the conversation shifts.
      </div>
    );
  }

  return (
    <div className="scrollbar-none flex h-10 shrink-0 items-stretch gap-0 overflow-x-auto border-border border-b bg-bg-elevated">
      {topics.map((topic) => {
        const isActive = topic.id === activeTopicId;
        return (
          <button
            aria-pressed={isActive}
            className={cx(
              "relative flex min-w-[120px] shrink-0 flex-col justify-center border-border-subtle border-r px-3 text-left transition-all duration-200 ease-out last:border-r-0 hover:bg-bg-subtle",
              isActive &&
                "border-l-2 border-l-accent bg-accent-subtle/50 hover:bg-accent-subtle"
            )}
            key={topic.id}
            onClick={() => onSelectTopic(topic)}
            type="button"
          >
            {isActive ? (
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-[2px] bg-accent transition-all duration-300"
              />
            ) : null}
            <span
              className={cx(
                "truncate font-medium text-xs transition-colors duration-200",
                isActive ? "text-fg" : "text-fg-muted"
              )}
            >
              {topic.label}
            </span>
            <span className="font-mono text-[10px] text-fg-subtle tabular-nums">
              +{formatTopicOffset(meetingStartedAtMs, topic.startedAt)}
            </span>
          </button>
        );
      })}
      <span aria-hidden className="w-2 shrink-0" />
    </div>
  );
}
