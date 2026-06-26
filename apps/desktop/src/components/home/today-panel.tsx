import type { TodayMeeting } from "../../features/home/types";
import { metricChipClass, panelClass } from "../../lib/ui";

interface TodayPanelProps {
  loading: boolean;
  meetings: TodayMeeting[];
}

function formatTime(iso: string | null): string {
  if (!iso) {
    return "--:--";
  }
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderContent(meetings: TodayMeeting[], loading: boolean) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <div
            className="flex animate-pulse items-center gap-3 rounded-lg py-1.5"
            key={`today-sk-${i}`}
          >
            <div className="h-3 w-12 rounded-sm bg-bg-subtle" />
            <div className="h-3 w-20 rounded-sm bg-bg-subtle" />
            <div className="h-3 w-32 rounded-sm bg-bg-subtle" />
          </div>
        ))}
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <p className="py-1 text-[11.5px] text-fg-muted leading-relaxed">
        No meetings scheduled today
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {meetings.map((meeting) => (
        <li key={meeting.id}>
          <button
            className="flex w-full items-center gap-3 rounded-lg px-1.5 py-1.5 text-left transition-colors duration-150 ease-out hover:bg-bg-subtle"
            type="button"
          >
            <span className="w-12 shrink-0 font-medium text-[11.5px] text-fg-muted tabular-nums leading-none">
              {formatTime(meeting.scheduledAt)}
            </span>
            <span className="min-w-0 truncate font-medium text-[12.5px] text-fg leading-snug">
              {meeting.title}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-border bg-bg-overlay px-2 py-0.5 font-medium text-[10px] text-fg-muted leading-snug">
                {meeting.client.name}
              </span>
              <span
                className={metricChipClass(
                  meeting.briefStatus === "prepped" ? "success" : "muted"
                )}
              >
                {meeting.briefStatus === "prepped" ? "Prepped" : "Not prepped"}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function TodayPanel({ meetings, loading }: TodayPanelProps) {
  return (
    <div className={panelClass}>
      <div className="mb-2.5 flex items-center justify-between">
        <p className="font-medium text-[11px] text-text-tertiary uppercase leading-none tracking-[0.06em]">
          Today
        </p>
        {loading ? null : (
          <span className="font-medium text-[10.5px] text-fg-subtle tabular-nums leading-none">
            {meetings.length}
          </span>
        )}
      </div>
      {renderContent(meetings, loading)}
    </div>
  );
}
