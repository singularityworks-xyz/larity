import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  buttonClass,
  cx,
  segmentButtonActiveClass,
  segmentButtonClass,
  segmentControlClass,
} from "../../lib/ui";
import type { LivePendingUtterance, LiveUtterance } from "./types";

function formatUtteranceClock(meetingStartMs: number, ts: number): string {
  const delta = Math.max(0, ts - meetingStartMs);
  const totalSec = Math.floor(delta / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function SpeakerChip({
  confidence,
  name,
  speakerType,
}: {
  confidence?: number;
  name: string;
  speakerType: LiveUtterance["speakerType"];
}) {
  let dot = "bg-fg-subtle";
  if (confidence !== undefined) {
    if (confidence >= 0.85) {
      dot = "bg-success-fg";
    } else if (confidence >= 0.6) {
      dot = "bg-warning-fg";
    }
  } else if (speakerType === "team_self") {
    dot = "bg-accent";
  }

  let chip =
    "border border-dashed border-border-strong bg-transparent text-fg-subtle";
  if (speakerType === "team_self") {
    chip = "border-0 bg-accent-subtle text-accent";
  } else if (speakerType === "team") {
    chip = "border-0 bg-bg-subtle text-fg";
  } else if (speakerType === "external") {
    chip = "border border-border-strong bg-transparent text-fg-muted";
  }

  return (
    <span
      className={cx(
        "inline-flex h-[18px] items-center gap-1 rounded-[2px] px-1.5 font-medium font-sans text-[11px] leading-none",
        chip
      )}
    >
      <span
        className={cx("inline-block h-1 w-1 shrink-0 rounded-[2px]", dot)}
      />
      {name}
    </span>
  );
}

type StreamMode = "full" | "commitments";

function captureChannelLabel(channel: number): string {
  return channel === 0 ? "Mic" : "System";
}

interface TranscriptStreamProps {
  meetingStartedAtMs: number;
  utterances: LiveUtterance[];
  scrollTargetId: string | null;
  onConsumedScrollTarget: () => void;
  pendingFinals?: LivePendingUtterance[];
  livePartial?: { text: string; ts: number; channel: number } | null;
}

export function TranscriptStream({
  meetingStartedAtMs,
  utterances,
  scrollTargetId,
  onConsumedScrollTarget,
  pendingFinals = [],
  livePartial = null,
}: TranscriptStreamProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [mode, setMode] = useState<StreamMode>("full");

  const visible = utterances.filter((u) =>
    mode === "commitments" ? u.isCommitment : true
  );

  const showLiveTail =
    mode === "full" &&
    (pendingFinals.length > 0 || Boolean(livePartial?.text?.trim()));

  const listIsEmpty = visible.length === 0 && !showLiveTail;
  const scrollToBottom = useCallback(() => {
    const el = rootRef.current;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
    setPinnedToBottom(true);
  }, []);

  const handleScroll = useCallback(() => {
    const el = rootRef.current;
    if (!el) {
      return;
    }
    const threshold = 96;
    setPinnedToBottom(
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    );
  }, []);

  useLayoutEffect(() => {
    if (!scrollTargetId) {
      return;
    }
    const node = document.getElementById(`utterance-${scrollTargetId}`);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
    node?.animate([{ backgroundColor: "var(--accent-subtle)" }, {}], {
      duration: 1200,
      easing: "ease-out",
    });
    onConsumedScrollTarget();
  }, [scrollTargetId, onConsumedScrollTarget]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rerun when transcript/filter mode changes layout height
  useEffect(() => {
    if (!pinnedToBottom) {
      return;
    }
    scrollToBottom();
  }, [
    pinnedToBottom,
    scrollToBottom,
    utterances.length,
    visible.length,
    mode,
    pendingFinals.length,
    livePartial?.text,
  ]);

  const showJump = !pinnedToBottom && (visible.length > 0 || showLiveTail);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border border-r bg-bg">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-border-subtle border-b px-3 py-2">
        <span className="font-medium text-[11px] text-fg-muted">
          Live transcript
        </span>
        <div className={segmentControlClass}>
          <button
            className={cx(
              segmentButtonClass,
              mode === "full" ? segmentButtonActiveClass : ""
            )}
            onClick={() => setMode("full")}
            type="button"
          >
            Full text
          </button>
          <button
            className={cx(
              segmentButtonClass,
              mode === "commitments" ? segmentButtonActiveClass : ""
            )}
            onClick={() => setMode("commitments")}
            type="button"
          >
            Commitments only
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          className="h-full overflow-y-auto px-2 py-3"
          onScroll={handleScroll}
          ref={rootRef}
          role="log"
        >
          {listIsEmpty ? (
            <p className="px-2 py-8 text-center text-fg-muted text-xs">
              {mode === "commitments"
                ? "No commitments classified in this meeting yet."
                : "Transcript lines appear here as audio is processed."}
            </p>
          ) : (
            <>
              {visible.map((row) => (
                <div
                  className="group flex gap-2 border-border-subtle border-b py-2 pr-2 last:border-b-0 hover:bg-bg-subtle/80"
                  id={`utterance-${row.id}`}
                  key={row.id}
                >
                  <div
                    aria-hidden
                    className="flex w-2 shrink-0 flex-col items-center gap-1 pt-1"
                  >
                    {row.hasMemory ? (
                      <span
                        className="h-1.5 w-1.5 bg-accent"
                        title="Remember this"
                      />
                    ) : (
                      <span className="h-1.5 w-1.5 opacity-0" />
                    )}
                    {row.hasAlert ? (
                      <span
                        className="h-1.5 w-1.5 bg-warning-fg"
                        title="Alert"
                      />
                    ) : null}
                  </div>
                  <div className="grid min-w-0 flex-1 gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SpeakerChip
                        confidence={row.confidence}
                        name={row.speakerName}
                        speakerType={row.speakerType}
                      />
                      <time
                        className="font-mono text-[11px] text-fg-subtle tabular-nums"
                        dateTime={new Date(row.timestamp).toISOString()}
                      >
                        {formatUtteranceClock(
                          meetingStartedAtMs,
                          row.timestamp
                        )}
                      </time>
                    </div>
                    <p className="m-0 font-mono text-[13px] text-fg leading-relaxed">
                      {row.text}
                    </p>
                  </div>
                </div>
              ))}
              {mode === "full"
                ? pendingFinals.map((row) => (
                    <div
                      className="group flex gap-2 border-border-subtle border-b py-2 pr-2 opacity-75 last:border-b-0"
                      key={row.key}
                    >
                      <div
                        aria-hidden
                        className="flex w-2 shrink-0 flex-col items-center gap-1 pt-1"
                      >
                        <span className="h-1.5 w-1.5 opacity-0" />
                      </div>
                      <div className="grid min-w-0 flex-1 gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cx(
                              "inline-flex h-[18px] items-center gap-1 rounded-[2px] border border-border-strong border-dashed bg-transparent px-1.5 font-medium font-sans text-[11px] text-fg-muted leading-none"
                            )}
                            title="Awaiting speaker and topic enrichment"
                          >
                            <span className="inline-block h-1 w-1 shrink-0 rounded-[2px] bg-fg-subtle" />
                            Live · {captureChannelLabel(row.channel)}
                          </span>
                          <time
                            className="font-mono text-[11px] text-fg-subtle tabular-nums"
                            dateTime={new Date(row.ts).toISOString()}
                          >
                            {formatUtteranceClock(meetingStartedAtMs, row.ts)}
                          </time>
                        </div>
                        <p className="m-0 font-mono text-[13px] text-fg-muted leading-relaxed">
                          {row.text}
                        </p>
                      </div>
                    </div>
                  ))
                : null}
              {mode === "full" && livePartial?.text?.trim() ? (
                <div className="group flex gap-2 border-border-subtle border-b py-2 pr-2 opacity-90 last:border-b-0">
                  <div
                    aria-hidden
                    className="flex w-2 shrink-0 flex-col items-center gap-1 pt-1"
                  >
                    <span className="h-1.5 w-1.5 opacity-0" />
                  </div>
                  <div className="grid min-w-0 flex-1 gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cx(
                          "inline-flex h-[18px] items-center gap-1 rounded-[2px] border border-border-strong border-dashed bg-transparent px-1.5 font-medium font-sans text-[11px] text-fg-muted leading-none"
                        )}
                      >
                        <span className="inline-block h-1 w-1 shrink-0 animate-pulse rounded-[2px] bg-accent" />
                        Speaking · {captureChannelLabel(livePartial.channel)}
                      </span>
                      <time
                        className="font-mono text-[11px] text-fg-subtle tabular-nums"
                        dateTime={new Date(livePartial.ts).toISOString()}
                      >
                        {formatUtteranceClock(
                          meetingStartedAtMs,
                          livePartial.ts
                        )}
                      </time>
                    </div>
                    <p className="m-0 font-mono text-[13px] text-fg-muted leading-relaxed after:ml-0.5 after:animate-pulse after:font-medium after:text-accent after:content-['▍']">
                      {livePartial.text}
                    </p>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        {showJump ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <button
              className={cx(
                buttonClass({ size: "sm", variant: "secondary" }),
                "pointer-events-auto shadow-[var(--shadow-popover)]"
              )}
              onClick={scrollToBottom}
              type="button"
            >
              Jump to now
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
