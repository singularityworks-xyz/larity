import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState } from "react";
import { cx } from "../lib/ui";
import { AlertRegion } from "./alert-region";
import { AmbientStrip } from "./ambient-strip";
import { OverlayFooter } from "./overlay-footer";
import { useOverlayData } from "./use-overlay-data";
import { VoiceGradient } from "./voice-gradient";

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

export function OverlayShell() {
  const data = useOverlayData();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isEndingBusy, setIsEndingBusy] = useState(false);

  useEffect(() => {
    let rafId: number;
    let lastDisplayedSec = -1;

    const tick = () => {
      const realMs = Math.max(0, Date.now() - data.startedAtMs);
      const baseMs = 8 * 60 * 1000; // Start at 08:00
      const jumpStartMs = 12_000; // Trigger fast-forward after 12 real seconds (at 08:12)
      const jumpDuration = 4000; // Fast-forward takes 4 seconds
      const jumpAmount = 42 * 60 * 1000; // Adds 42 minutes

      let displayMs = baseMs + realMs;

      if (realMs > jumpStartMs) {
        if (realMs <= jumpStartMs + jumpDuration) {
          const progress = (realMs - jumpStartMs) / jumpDuration;
          // Smooth ease-in-out curve for cinematic counter spinning
          const easeInOut =
            progress < 0.5
              ? 2 * progress * progress
              : 1 - (-2 * progress + 2) ** 2 / 2;
          displayMs += easeInOut * jumpAmount;
        } else {
          displayMs += jumpAmount;
        }
      }

      const currentSec = Math.floor(displayMs / 1000);
      if (currentSec !== lastDisplayedSec) {
        setElapsedMs(displayMs);
        lastDisplayedSec = currentSec;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [data.startedAtMs]);

  const handleEndMeeting = useCallback(async () => {
    setIsEndingBusy(true);
    try {
      await getCurrentWindow().close();
    } catch {
      window.close();
    }
  }, []);

  const handleExpandToPanel = useCallback(() => {
    console.log("Expanded to panel");
  }, []);

  const isVisuallySpeaking = data.micAmplitude > 0.05 || data.isMicActive;

  return (
    <div
      className={cx(
        "relative flex h-[100vh] w-[100vw] select-none flex-col overflow-hidden",
        "rounded-[12px] border border-border",
        "bg-bg/50",
        "shadow-2xl"
      )}
      data-tauri-drag-region
      onPointerDown={(e) => {
        if (
          e.target instanceof HTMLElement &&
          e.target.closest("[data-tauri-drag-region]")
        ) {
          getCurrentWindow().startDragging();
        }
      }}
    >
      <VoiceGradient
        alertSeverity={data.visibleAlerts[0]?.severity ?? null}
        alertsMuted={data.alertsMuted}
        amplitude={data.micAmplitude}
        hasActiveAlert={data.visibleAlerts.length > 0}
        isSpeaking={isVisuallySpeaking}
      />

      <div className="relative z-[1] flex flex-1 flex-col overflow-hidden">
        <div
          className="flex h-7 items-center justify-between border-border-subtle border-b bg-bg-subtle/50 px-3"
          data-tauri-drag-region
        >
          <div
            className="flex min-w-0 items-center gap-1.5"
            data-tauri-drag-region
          >
            <span className="relative inline-flex h-[5px] w-[5px] shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-50" />
              <span className="relative inline-flex h-[5px] w-[5px] rounded-full bg-accent" />
            </span>
            <span className="truncate font-medium text-[9px] text-fg-subtle">
              {data.clientName}
            </span>
            <span className="text-[9px] text-fg-subtle/40">&middot;</span>
            <span className="truncate font-medium text-[10px] text-fg-muted">
              {data.meetingTitle}
            </span>
          </div>
          <button
            type="button"
            className="shrink-0 cursor-pointer font-mono text-[10px] text-fg-subtle tabular-nums transition-colors hover:text-fg"
            onClick={data.resetApp}
          >
            {formatElapsed(elapsedMs)}
          </button>
        </div>

        <AmbientStrip
          connectedTeammates={data.connectedTeammates}
          constraintCount={data.constraintCount}
          currentSpeaker={data.currentSpeaker}
          currentTopic={data.currentTopic}
          isMicActive={data.isMicActive}
          isVisuallySpeaking={isVisuallySpeaking}
          micAmplitude={data.micAmplitude}
        />

        <AlertRegion
          alertsMuted={data.alertsMuted}
          exitingIds={data.exitingIds}
          expandedAlertId={data.expandedAlertId}
          onDismiss={data.dismissAlert}
          onToggleExpand={data.setExpandedAlertId}
          visibleAlerts={data.visibleAlerts}
        />

        <OverlayFooter
          alertsMuted={data.alertsMuted}
          autoExpiryEnabled={data.autoExpiryEnabled}
          isEndingBusy={isEndingBusy}
          isHost={data.role === "host"}
          onEndMeeting={handleEndMeeting}
          onExpandToPanel={handleExpandToPanel}
          onMuteAlerts={() => data.setAlertsMuted(!data.alertsMuted)}
          onToggleAutoExpiry={() =>
            data.setAutoExpiryEnabled(!data.autoExpiryEnabled)
          }
          pendingCount={data.pendingCount}
        />
      </div>
    </div>
  );
}
