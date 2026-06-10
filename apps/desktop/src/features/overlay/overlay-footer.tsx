import { Bell, BellOff, Bookmark, Maximize2, PhoneOff } from "lucide-react";
import { cx } from "../../lib/ui";

interface OverlayFooterProps {
  isHost: boolean;
  alertsMuted: boolean;
  isEndingBusy: boolean;
  rememberFlash: boolean;
  pendingCount?: number;
  onEndMeeting: () => void;
  onMuteAlerts: () => void;
  onExpandToPanel: () => void;
  onRememberThis: () => void;
}

const footerButtonBase =
  "inline-flex h-[26px] cursor-pointer items-center justify-center gap-[5px] rounded-[5px] border border-white/[0.06] bg-white/[0.04] px-[10px] font-medium text-[10px] text-fg-muted leading-none transition-[background-color,border-color,color] duration-100 ease-out [-webkit-app-region:no-drag] [app-region:no-drag] hover:border-white/[0.10] hover:bg-white/[0.08] hover:text-fg active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40";

export function OverlayFooter({
  isHost,
  alertsMuted,
  isEndingBusy,
  rememberFlash,
  pendingCount = 0,
  onEndMeeting,
  onMuteAlerts,
  onExpandToPanel,
  onRememberThis,
}: OverlayFooterProps) {
  return (
    <div className="flex items-center gap-1.5 border-white/[0.05] border-t px-2.5 py-2">
      <button
        aria-busy={isEndingBusy}
        className={cx(
          footerButtonBase,
          isHost
            ? "border-danger-fg/[0.15] bg-danger-fg/[0.08] text-danger-fg hover:border-danger-fg/[0.25] hover:bg-danger-fg/[0.15] hover:text-danger-fg"
            : ""
        )}
        disabled={isEndingBusy}
        onClick={onEndMeeting}
        type="button"
      >
        <PhoneOff className="h-3 w-3" strokeWidth={1.5} />
        <span>{isHost ? "End" : "Leave"}</span>
      </button>

      <button
        aria-label={alertsMuted ? "Unmute alerts" : "Mute alerts"}
        aria-pressed={alertsMuted}
        className={footerButtonBase}
        onClick={onMuteAlerts}
        title={alertsMuted ? "Unmute alerts" : "Mute alerts"}
        type="button"
      >
        {alertsMuted ? (
          <BellOff className="h-3 w-3" strokeWidth={1.5} />
        ) : (
          <Bell className="h-3 w-3" strokeWidth={1.5} />
        )}
      </button>

      <button
        aria-label="Expand to panel"
        className={footerButtonBase}
        onClick={onExpandToPanel}
        title="Expand to full panel"
        type="button"
      >
        <Maximize2 className="h-3 w-3" strokeWidth={1.5} />
      </button>

      <span className="flex-1" />

      {pendingCount > 0 && (
        <span className="inline-flex h-[18px] items-center gap-1 rounded-[3px] border border-warning-fg/20 bg-warning-bg px-1.5 font-mono text-[9px] text-warning-fg">
          +{pendingCount} queued
        </span>
      )}

      <button
        aria-label="Remember this moment"
        aria-pressed={rememberFlash}
        className={cx(
          footerButtonBase,
          rememberFlash &&
            "border-white/[0.10] bg-accent-subtle text-accent hover:border-white/[0.10] hover:bg-accent-subtle hover:text-accent"
        )}
        onClick={onRememberThis}
        title="Remember this"
        type="button"
      >
        <Bookmark
          className={cx("h-3 w-3", rememberFlash && "fill-accent")}
          strokeWidth={1.5}
        />
      </button>
    </div>
  );
}
