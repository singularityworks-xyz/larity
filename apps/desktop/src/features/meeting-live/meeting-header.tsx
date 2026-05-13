import { Bell, BellOff, Bookmark, PhoneOff, UserCog } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonClass, cx, eyebrowClass, heroTitleClass } from "../../lib/ui";
import { HeartbeatDotInline } from "./listening-heartbeat";

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
  onRememberThis: () => void;
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
  onRememberThis,
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

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-4 border-border border-b bg-bg px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <HeartbeatDotInline isActive={isStreamActive} size={7} />
        <div className="min-w-0">
          <p className={cx(eyebrowClass, "truncate")}>{clientName}</p>
          <h1 className={cx(heroTitleClass, "truncate text-base")}>
            {meetingTitle}
          </h1>
        </div>
      </div>

      <time
        className="font-mono text-fg-muted text-xs tabular-nums"
        dateTime={`PT${Math.floor(elapsedMs / 1000)}S`}
      >
        {formatElapsed(elapsedMs)}
      </time>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {isHost ? (
          <button
            aria-label={
              allowNameCustomization
                ? "Disable name customization"
                : "Enable name customization"
            }
            className={buttonClass({ variant: "ghost", icon: true })}
            onClick={onToggleNameCustomization}
            title={
              allowNameCustomization
                ? "Name customization on"
                : "Name customization off"
            }
            type="button"
          >
            <UserCog className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        ) : null}
        <button
          aria-label="Remember this moment"
          className={buttonClass({ variant: "ghost", icon: true })}
          onClick={onRememberThis}
          title="Remember this"
          type="button"
        >
          <Bookmark className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
        <button
          aria-label={alertsMuted ? "Unmute alerts" : "Mute alerts"}
          className={buttonClass({ variant: "ghost", icon: true })}
          onClick={onMuteAlertsToggle}
          title={alertsMuted ? "Unmute alerts" : "Mute alerts"}
          type="button"
        >
          {alertsMuted ? (
            <BellOff className="h-3.5 w-3.5" strokeWidth={1.5} />
          ) : (
            <Bell className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
        </button>
        <button
          aria-busy={isEndingBusy}
          className={buttonClass({
            variant: isHost ? "danger" : "secondary",
            size: "sm",
          })}
          disabled={isEndingBusy}
          onClick={onEndMeeting}
          type="button"
        >
          <PhoneOff className="inline h-3.5 w-3.5" strokeWidth={1.5} />
          <span className="ml-1">{isHost ? "End meeting" : "Leave"}</span>
        </button>
      </div>
    </header>
  );
}
