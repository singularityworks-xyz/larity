import type { NextMeeting } from "../../features/home/types";
import { startMeetingModeClass } from "../../lib/ui";

interface NextMeetingCardProps {
  meeting: NextMeeting | null;
  loading: boolean;
}

export function NextMeetingCard({ meeting, loading }: NextMeetingCardProps) {
  if (loading) {
    return (
      <article className={startMeetingModeClass} style={{ minHeight: 112 }}>
        <div className="flex flex-col gap-2.5">
          <div className="h-3 w-28 animate-pulse rounded-sm bg-bg-subtle" />
          <div className="h-4 w-56 animate-pulse rounded-sm bg-bg-subtle" />
          <div className="h-7 w-64 animate-pulse rounded-sm bg-bg-subtle" />
        </div>
      </article>
    );
  }

  if (!meeting) {
    return (
      <article className={startMeetingModeClass}>
        <div className="flex flex-col gap-1.5">
          <p className="font-medium text-[11px] text-fg-muted uppercase leading-none tracking-[0.06em]">
            Next Meeting
          </p>
          <p className="font-medium text-fg text-sm leading-snug">
            No upcoming meetings
          </p>
          <p className="text-[11.5px] text-fg-muted leading-relaxed">
            Your next scheduled meeting will appear here.{" "}
            <span className="text-fg-subtle">
              Schedule one from the web app.
            </span>
          </p>
        </div>
      </article>
    );
  }

  const countdownLabel =
    meeting.startsInMinutes <= 1
      ? "Starting now"
      : `In ${meeting.startsInMinutes} min`;

  return (
    <article className={startMeetingModeClass}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <p className="font-medium text-[11px] text-fg-muted uppercase leading-none tracking-[0.06em]">
              Next Meeting
            </p>
            <span className="inline-flex h-[18px] items-center rounded-md border border-[rgba(63,185,80,0.25)] bg-[#3FB9501A] px-2 font-medium text-[10px] text-success-fg leading-none">
              {countdownLabel}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="shrink-0 rounded-[5px] border border-border-subtle bg-bg-subtle px-1.5 py-px font-medium text-[10.5px] text-fg-muted leading-snug">
              {meeting.client.name}
            </span>
          </div>
          <h1 className="mt-0.5 font-semibold text-[15px] text-fg leading-snug tracking-[-0.01em]">
            {meeting.title}
          </h1>
          <p className="text-[11.5px] text-fg-muted leading-relaxed">
            {meeting.attendeeCount > 0
              ? `${meeting.attendeeCount} attendee${meeting.attendeeCount !== 1 ? "s" : ""}`
              : "No attendees listed"}{" "}
            &middot;{" "}
            <span className="inline-flex items-center gap-1">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  meeting.briefStatus === "prepped"
                    ? "bg-success-fg"
                    : "bg-fg-subtle"
                }`}
              />
              {meeting.briefStatus === "prepped"
                ? "Brief ready"
                : "Brief not prepared"}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            className="inline-flex h-7 items-center rounded-lg border border-border bg-bg-elevated px-3 font-medium text-[11.5px] text-fg leading-none transition-all duration-150 ease-out hover:border-border-strong hover:bg-bg-subtle active:scale-[0.98]"
            type="button"
          >
            Open brief
          </button>
          <button
            className="inline-flex h-7 items-center rounded-lg bg-accent px-3 font-semibold text-[11.5px] text-accent-fg leading-none transition-all duration-150 ease-out hover:bg-accent-hover active:scale-[0.98]"
            type="button"
          >
            Start mode
          </button>
          <button
            className="inline-flex h-7 items-center rounded-lg border border-border-subtle bg-transparent px-3 font-medium text-[11px] text-fg-muted leading-none transition-all duration-150 ease-out hover:border-border hover:text-fg active:scale-[0.98]"
            type="button"
          >
            Mute prompt
          </button>
        </div>
      </div>
    </article>
  );
}
