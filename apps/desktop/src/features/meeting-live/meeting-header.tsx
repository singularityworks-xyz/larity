import { Bell, BellOff, PhoneOff, UserCog } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "../../lib/ui";

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function LiveIndicator({ isActive }: { isActive: boolean }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
      {isActive && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
      )}
      <span
        className={cx(
          "relative inline-flex h-1.5 w-1.5 rounded-full",
          isActive ? "bg-accent" : "bg-fg-subtle"
        )}
      />
    </span>
  );
}

interface MeetingHeaderProps {
  clientName: string;
  meetingTitle: string;
  startedAtMs: number;
  isHost: boolean;
  isStreamActive: boolean;
  alertsMuted: boolean;
  isEndingBusy: boolean;
  allowNameCustomization: boolean;
  onMuteAlertsToggle: () => void;
  // onRememberThis: () => void;
  onEndMeeting: () => void;
  onToggleNameCustomization: () => void;
}

export function MeetingHeader({
  clientName,
  meetingTitle,
  startedAtMs,
  isHost,
  isStreamActive,
  alertsMuted,
  isEndingBusy,
  allowNameCustomization,
  onMuteAlertsToggle,
  // onRememberThis,
  onEndMeeting,
  onToggleNameCustomization,
}: MeetingHeaderProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const tick = () => setElapsedMs(Math.max(0, Date.now() - startedAtMs));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAtMs]);

  const ghostButtonClass = cx(
    "flex h-7 w-7 items-center justify-center rounded-[5px]",
    "text-fg-subtle hover:bg-white/[0.05] hover:border hover:border-white/[0.06] transition-colors hover:text-fg"
  );

  return (
    <header className="meeting-header relative sticky top-0 z-20 flex h-[52px] shrink-0 items-center gap-4 border-border border-b bg-bg px-4">
      <div className="relative z-[1] flex min-w-0 flex-1 items-center gap-2.5">
        <LiveIndicator isActive={isStreamActive} />
        <div className="min-w-0">
          <p className="truncate font-medium text-[10px] text-fg-subtle uppercase tracking-[0.06em]">
            {clientName}
          </p>
          <h1
            className="truncate font-medium text-[15px] text-fg leading-tight"
            style={{ fontFamily: "var(--font-display, var(--font-sans))" }}
          >
            {meetingTitle}
          </h1>
        </div>
      </div>

      <time
        className="relative z-[1] shrink-0 font-mono text-[12px] text-fg-muted tabular-nums"
        dateTime={`PT${Math.floor(elapsedMs / 1000)}S`}
      >
        {formatElapsed(elapsedMs)}
      </time>

      <div className="relative z-[1] flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {isHost && (
          <button
            aria-label={
              allowNameCustomization
                ? "Disable name customization"
                : "Enable name customization"
            }
            className={ghostButtonClass}
            onClick={onToggleNameCustomization}
            title={
              allowNameCustomization
                ? "Name customization on"
                : "Name customization off"
            }
            type="button"
          >
            <UserCog className="h-4 w-4" strokeWidth={1.5} />
          </button>
        )}
        {/* 
        <button
          aria-label="Remember this moment"
          className={ghostButtonClass}
          onClick={onRememberThis}
          title="Remember this"
          type="button"
        >
          <Bookmark className="h-4 w-4" strokeWidth={1.5} />
        </button>
        */}
        <button
          aria-label={alertsMuted ? "Unmute alerts" : "Mute alerts"}
          className={ghostButtonClass}
          onClick={onMuteAlertsToggle}
          title={alertsMuted ? "Unmute alerts" : "Mute alerts"}
          type="button"
        >
          {alertsMuted ? (
            <BellOff className="h-4 w-4" strokeWidth={1.5} />
          ) : (
            <Bell className="h-4 w-4" strokeWidth={1.5} />
          )}
        </button>
        <button
          aria-busy={isEndingBusy}
          className={cx(
            "inline-flex h-7 items-center gap-1.5 rounded-[5px] px-3",
            "font-semibold text-[11px] transition-all duration-150",
            isHost
              ? "border border-transparent bg-danger text-danger-fg shadow-sm hover:brightness-110 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
              : "border border-border bg-bg-subtle text-fg-muted hover:bg-bg-emphasis hover:text-fg active:scale-95 disabled:pointer-events-none disabled:opacity-50"
          )}
          disabled={isEndingBusy}
          onClick={onEndMeeting}
          type="button"
        >
          <PhoneOff className="h-3.5 w-3.5" strokeWidth={1.5} />
          {isHost ? "End meeting" : "Leave"}
        </button>
      </div>
    </header>
  );
}
