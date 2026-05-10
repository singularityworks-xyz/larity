import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState } from "react";
import { cx } from "../../lib/ui";
import { AlertRegion } from "./alert-region";
import { AmbientStrip } from "./ambient-strip";
import { OverlayFooter } from "./overlay-footer";
import { useOverlayData } from "./use-overlay-data";

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function closeSelf() {
  try {
    await getCurrentWindow().close();
  } catch {
    window.close();
  }
}

export function OverlayShell() {
  const data = useOverlayData();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isEndingBusy, setIsEndingBusy] = useState(false);

  useEffect(() => {
    const tick = () => setElapsedMs(Math.max(0, Date.now() - data.startedAtMs));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [data.startedAtMs]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen("meeting:ended", () => {
      closeSelf().catch(() => {
        // window may already be closing
      });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const handleEndMeeting = useCallback(async () => {
    setIsEndingBusy(true);
    try {
      await emit("overlay:end-meeting", { sessionId: data.sessionId });
    } catch {
      await closeSelf();
    }
  }, [data.sessionId]);

  const handleExpandToPanel = useCallback(async () => {
    try {
      await emit("overlay:expand", { sessionId: data.sessionId });
    } catch {
      // fallback: try to focus main window
    }
  }, [data.sessionId]);

  return (
    <div
      className={cx(
        "flex h-screen w-screen select-none flex-col overflow-hidden",
        "rounded-xl border border-white/[0.06]",
        "bg-[#08080a]/[0.97] backdrop-blur-2xl",
        "shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.02)]"
      )}
      data-tauri-drag-region
    >
      <div
        className="flex items-center justify-between border-white/[0.04] border-b px-3 py-1.5"
        data-tauri-drag-region
      >
        <div className="flex min-w-0 items-center gap-2" data-tauri-drag-region>
          <span className="inline-block h-1 w-1 shrink-0 animate-pulse rounded-full bg-success-fg" />
          <span className="truncate font-medium text-[10px] text-fg-muted">
            {data.clientName}
          </span>
          <span className="text-fg-subtle">&middot;</span>
          <span className="truncate font-medium text-[10px] text-fg">
            {data.meetingTitle}
          </span>
        </div>
        <time
          className="shrink-0 font-mono text-[10px] text-fg-subtle tabular-nums"
          dateTime={`PT${Math.floor(elapsedMs / 1000)}S`}
        >
          {formatElapsed(elapsedMs)}
        </time>
      </div>

      <AmbientStrip
        connectedTeammates={data.connectedTeammates}
        constraintCount={data.constraintCount}
        currentSpeaker={data.currentSpeaker}
        currentTopic={data.currentTopic}
        isMicActive={data.isMicActive}
      />

      <AlertRegion
        alertsMuted={data.alertsMuted}
        expandedAlertId={data.expandedAlertId}
        onDismiss={data.dismissAlert}
        onToggleExpand={data.setExpandedAlertId}
        visibleAlerts={data.visibleAlerts}
      />

      {data.rememberFlash ? (
        <div
          aria-live="polite"
          className="border-white/[0.04] border-t bg-accent-subtle/40 px-3 py-1.5 text-center font-medium text-[10px] text-accent"
        >
          Marked this moment — last ~30s will be structured
        </div>
      ) : null}

      <OverlayFooter
        alertsMuted={data.alertsMuted}
        isEndingBusy={isEndingBusy}
        isHost={!!data.sessionId}
        onEndMeeting={handleEndMeeting}
        onExpandToPanel={handleExpandToPanel}
        onMuteAlerts={() => data.setAlertsMuted(!data.alertsMuted)}
        onRememberThis={data.handleRememberThis}
        rememberFlash={data.rememberFlash}
      />
    </div>
  );
}
