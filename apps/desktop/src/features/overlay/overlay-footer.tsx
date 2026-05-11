import { Bell, BellOff, Bookmark, Maximize2, PhoneOff } from "lucide-react";
import { cx } from "../../lib/ui";

interface OverlayFooterProps {
  isHost: boolean;
  alertsMuted: boolean;
  isEndingBusy: boolean;
  rememberFlash: boolean;
  onEndMeeting: () => void;
  onMuteAlerts: () => void;
  onExpandToPanel: () => void;
  onRememberThis: () => void;
}

const footerButtonBase =
  "inline-flex h-[26px] cursor-pointer items-center justify-center gap-1 rounded-md border-0 bg-white/[0.04] px-2 font-medium text-[10px] text-fg-muted leading-none transition-[background-color,color,opacity] duration-100 ease-out [-webkit-app-region:no-drag] [app-region:no-drag] hover:bg-white/[0.08] hover:text-fg active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40";

export function OverlayFooter({
  isHost,
  alertsMuted,
  isEndingBusy,
  rememberFlash,
  onEndMeeting,
  onMuteAlerts,
  onExpandToPanel,
  onRememberThis,
}: OverlayFooterProps) {
  return (
    <div className="flex items-center gap-1 border-white/[0.04] border-t px-3 py-2">
      <button
        aria-busy={isEndingBusy}
        className={cx(
          footerButtonBase,
          isHost && "text-danger-fg hover:bg-danger-bg hover:text-danger-fg"
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

      <button
        aria-label="Remember this moment"
        aria-pressed={rememberFlash}
        className={cx(
          footerButtonBase,
          rememberFlash && "bg-accent-subtle text-accent"
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
