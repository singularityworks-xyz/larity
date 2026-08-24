import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState } from "react";
import { cx } from "../../lib/ui";
import { useConfirmSpeakerMapping } from "../meetings/use-confirm-speaker-mapping";
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

async function closeSelf() {
  try {
    await getCurrentWindow().close();
  } catch {
    window.close();
  }
}

export function OverlayShell() {
  const data = useOverlayData();
  const confirmSpeakerMapping = useConfirmSpeakerMapping();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isEndingBusy, setIsEndingBusy] = useState(false);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

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

  const isVisuallySpeaking = data.isMicActive;

  return (
    <div
      className={cx(
        "relative flex h-screen w-screen select-none flex-col overflow-hidden",
        "rounded-[12px] border border-border",
        "bg-bg/50",
        "shadow-2xl"
      )}
      data-tauri-drag-region
    >
      <VoiceGradient
        alertSeverity={data.visibleAlerts[0]?.severity ?? null}
        alertsMuted={data.alertsMuted}
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
          isVisuallySpeaking={isVisuallySpeaking}
        />

        <AlertRegion
          alertsMuted={data.alertsMuted}
          exitingIds={data.exitingIds}
          expandedAlertId={data.expandedAlertId}
          onDismiss={data.dismissAlert}
          onToggleExpand={data.setExpandedAlertId}
          visibleAlerts={data.visibleAlerts}
        />

        {data.identityGuesses.length > 0 && (
          <div className="absolute top-8 right-2 z-50 flex w-64 flex-col gap-2">
            {data.identityGuesses.map((guess) => (
              <div
                className="flex flex-col gap-2 rounded border border-border bg-bg/80 p-2 shadow-lg backdrop-blur"
                key={guess.id}
              >
                <p className="text-fg text-xs">
                  Map Speaker {guess.index} to Client Member {guess.memberId}?
                </p>
                {cardErrors[guess.id] && (
                  <p className="text-[10px] text-red-400 leading-tight">
                    {cardErrors[guess.id]}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    className="rounded bg-bg-subtle px-2 py-1 text-[10px] text-fg hover:bg-bg-hover disabled:opacity-50"
                    disabled={confirmSpeakerMapping.isPending}
                    onClick={() => {
                      data.setIdentityGuesses((prev) =>
                        prev.filter((g) => g.id !== guess.id)
                      );
                      if (cardErrors[guess.id]) {
                        setCardErrors((prev) => {
                          const next = { ...prev };
                          delete next[guess.id];
                          return next;
                        });
                      }
                    }}
                    type="button"
                  >
                    Dismiss
                  </button>
                  <button
                    className="rounded bg-accent px-2 py-1 text-[10px] text-on-accent hover:bg-accent/80 disabled:opacity-50"
                    disabled={confirmSpeakerMapping.isPending}
                    onClick={async () => {
                      if (confirmSpeakerMapping.isPending) {
                        return;
                      }
                      try {
                        await confirmSpeakerMapping.mutateAsync({
                          meetingId: data.sessionId,
                          deepgramIndex: guess.index,
                          clientMemberId: guess.memberId,
                        });
                        await emit("overlay:speaker-mapped", {
                          sessionId: data.sessionId,
                          deepgramIndex: guess.index,
                          clientMemberId: guess.memberId,
                        });
                        data.setIdentityGuesses((prev) =>
                          prev.filter((g) => g.id !== guess.id)
                        );
                        if (cardErrors[guess.id]) {
                          setCardErrors((prev) => {
                            const next = { ...prev };
                            delete next[guess.id];
                            return next;
                          });
                        }
                      } catch (err) {
                        const msg =
                          err instanceof Error ? err.message : String(err);
                        setCardErrors((prev) => ({
                          ...prev,
                          [guess.id]: `Failed to map speaker ${guess.index} to member ${guess.memberId} for meeting ${data.sessionId}: ${msg}`,
                        }));
                      }
                    }}
                    type="button"
                  >
                    {confirmSpeakerMapping.isPending
                      ? "Confirming..."
                      : "Confirm"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 
        {data.rememberFlash && (
          <div
            aria-hidden
            className="pointer-events-none absolute right-3 bottom-2 h-8 w-8 rounded-full bg-accent-subtle"
            style={{
              animation:
                "remember-ripple 1.4s cubic-bezier(0.2, 0, 0, 1) forwards",
              zIndex: 2,
            }}
          />
        )}
        */}

        <OverlayFooter
          alertsMuted={data.alertsMuted}
          autoExpiryEnabled={data.autoExpiryEnabled}
          isEndingBusy={isEndingBusy}
          isHost={data.role === "host"}
          onEndMeeting={handleEndMeeting}
          onExpandToPanel={handleExpandToPanel}
          onMuteAlerts={() => data.setAlertsMuted(!data.alertsMuted)}
          // onRememberThis={data.handleRememberThis}
          onToggleAutoExpiry={() =>
            data.setAutoExpiryEnabled(!data.autoExpiryEnabled)
          }
          pendingCount={data.pendingCount}
          // rememberFlash={data.rememberFlash}
        />
      </div>
    </div>
  );
}
