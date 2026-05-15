import { Bell, ChevronsDown, FileText, ListChecks } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cx } from "../../lib/ui";
import { AlertCard } from "../alerts/alert-card";
import type { MeetingAlert } from "../alerts/types";
import { IDENTIFICATION_CONFIDENCE_THRESHOLD } from "./participant-avatars";
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
  speakerType: LiveUtterance["speakerType"] | "unknown";
}) {
  let dot = "bg-fg-subtle";
  if (confidence !== undefined) {
    if (confidence >= 0.85) {
      dot = "bg-success-fg";
    } else if (confidence >= IDENTIFICATION_CONFIDENCE_THRESHOLD) {
      dot = "bg-warning-fg";
    }
  } else if (speakerType === "team_self") {
    dot = "bg-accent";
  }

  const chipClass =
    {
      team_self: "bg-accent-subtle text-accent border-0",
      team: "bg-white/[0.06] text-fg border border-white/[0.08]",
      external: "bg-transparent text-fg-muted border border-border-strong",
      unknown:
        "bg-transparent text-fg-subtle border border-dashed border-border-strong",
    }[speakerType] ?? "bg-transparent text-fg-subtle border border-border";

  return (
    <span
      className={cx(
        "inline-flex h-[18px] items-center gap-[5px] rounded-[3px] px-[6px] font-medium font-sans text-[11px] leading-none",
        chipClass
      )}
    >
      <span
        className={cx(
          "inline-block h-[5px] w-[5px] shrink-0 rounded-[1px]",
          dot
        )}
      />
      {name}
    </span>
  );
}

type StreamMode = "full" | "commitments" | "alerts";

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
  alertHistory?: MeetingAlert[];
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex component, would benefit from refactor
export function TranscriptStream({
  meetingStartedAtMs,
  utterances,
  scrollTargetId,
  onConsumedScrollTarget,
  pendingFinals = [],
  livePartial = null,
  alertHistory = [],
}: TranscriptStreamProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [mode, setMode] = useState<StreamMode>("full");
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);

  const visible = utterances.filter((u) =>
    mode === "commitments" ? u.isCommitment : true
  );

  const showLiveTail =
    mode === "full" &&
    (pendingFinals.length > 0 || Boolean(livePartial?.text?.trim()));

  const listIsEmpty =
    (mode !== "alerts" && visible.length === 0 && !showLiveTail) ||
    (mode === "alerts" && alertHistory.length === 0);

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
    node?.animate(
      [
        {
          backgroundColor: "var(--accent-subtle)",
          outline: "1px solid rgba(124,92,255,0.3)",
        },
        { backgroundColor: "transparent", outline: "1px solid transparent" },
      ],
      { duration: 1400, easing: "ease-out", fill: "both" }
    );
    onConsumedScrollTarget();
  }, [scrollTargetId, onConsumedScrollTarget]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: visible.length triggers refire on new content
  useEffect(() => {
    if (!pinnedToBottom) {
      return;
    }
    scrollToBottom();
  }, [pinnedToBottom, scrollToBottom, visible.length]);

  const showJump = !pinnedToBottom && (visible.length > 0 || showLiveTail);

  const commitmentsByBlock: { speaker: string; rows: typeof visible }[] = [];
  if (mode === "commitments") {
    let currentSpeaker = "";
    let currentBlock: typeof visible = [];
    for (const row of visible) {
      if (row.speakerName !== currentSpeaker) {
        if (currentBlock.length > 0) {
          commitmentsByBlock.push({
            speaker: currentSpeaker,
            rows: currentBlock,
          });
        }
        currentSpeaker = row.speakerName || "Unknown";
        currentBlock = [row];
      } else {
        currentBlock.push(row);
      }
    }
    if (currentBlock.length > 0) {
      commitmentsByBlock.push({ speaker: currentSpeaker, rows: currentBlock });
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border border-r">
      {/* Tabs Nav */}
      <div
        aria-label="Transcript view mode"
        className="flex shrink-0 items-stretch gap-0 border-border-subtle border-b bg-bg-elevated"
        role="tablist"
      >
        {(["full", "commitments", "alerts"] as const).map((m) => (
          <button
            aria-current={mode === m ? "true" : undefined}
            className={cx(
              "relative flex h-8 items-center px-3 font-medium text-[11px] transition-colors duration-100",
              mode === m
                ? "text-fg after:absolute after:inset-x-0 after:bottom-0 after:h-[1.5px] after:bg-accent"
                : "text-fg-muted hover:text-fg"
            )}
            key={m}
            onClick={() => setMode(m)}
            type="button"
          >
            {m === "full" && "Transcript"}
            {m === "commitments" && "Commitments"}
            {m === "alerts" && (
              <>
                Alerts
                {alertHistory.length > 0 && (
                  <span className="ml-1.5 inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-[2px] bg-bg-subtle px-1 font-mono text-[9px] text-fg-muted tabular-nums">
                    {alertHistory.length}
                  </span>
                )}
              </>
            )}
          </button>
        ))}
        <span className="ml-auto flex items-center pr-3">
          {!pinnedToBottom && (
            <span className="inline-flex items-center gap-1 rounded-[3px] bg-accent-subtle px-1.5 py-0.5 font-medium text-[9px] text-accent">
              Scrolled up
            </span>
          )}
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          className="h-full overflow-y-auto bg-bg"
          onScroll={handleScroll}
          ref={rootRef}
          role="log"
        >
          {listIsEmpty && (
            <div className="flex flex-1 items-center justify-center py-12">
              <div className="text-center">
                {mode === "full" && (
                  <FileText
                    className="mx-auto mb-3 text-fg-subtle/40"
                    size={20}
                    strokeWidth={1}
                  />
                )}
                {mode === "commitments" && (
                  <ListChecks
                    className="mx-auto mb-3 text-fg-subtle/40"
                    size={20}
                    strokeWidth={1}
                  />
                )}
                {mode === "alerts" && (
                  <Bell
                    className="mx-auto mb-3 text-fg-subtle/40"
                    size={20}
                    strokeWidth={1}
                  />
                )}
                <p className="font-medium text-[12px] text-fg-subtle">
                  {mode === "full" &&
                    "Transcript appears as audio is processed."}
                  {mode === "commitments" && "No commitments classified yet."}
                  {mode === "alerts" && "No alerts have fired this session."}
                </p>
              </div>
            </div>
          )}

          {!listIsEmpty && mode === "alerts" && (
            <div className="mx-auto flex max-w-2xl flex-col gap-2 px-4 py-3">
              <div className="sticky top-0 z-10 flex items-center justify-between border-border-subtle border-b bg-bg px-4 py-2">
                <span className="font-medium text-[10px] text-fg-subtle uppercase tracking-[0.06em]">
                  Alert history · {alertHistory.length} total
                </span>
                <span className="font-mono text-[10px] text-fg-subtle">
                  This session
                </span>
              </div>
              {[...alertHistory].reverse().map((alert) => (
                <AlertCard
                  alert={alert}
                  expandedId={expandedAlertId}
                  isHistoryView
                  key={alert.id}
                  onToggleExpand={(id) =>
                    setExpandedAlertId((prev) => (prev === id ? null : id))
                  }
                />
              ))}
            </div>
          )}

          {!listIsEmpty && mode === "full" && (
            <div className="py-2 pl-2">
              {visible.map((row) => (
                <div
                  className="group grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-border-subtle border-b py-2 pr-3 last:border-b-0 hover:bg-bg-subtle/60"
                  id={`utterance-${row.id}`}
                  key={row.id}
                >
                  <div
                    aria-hidden
                    className="col-start-1 row-span-2 flex w-5 shrink-0 flex-col items-center gap-1 pt-1"
                  >
                    {row.hasMemory && (
                      <span
                        className="h-[5px] w-[5px] rounded-[1px] bg-accent"
                        title="Remembered"
                      />
                    )}
                    {row.hasAlert && (
                      <span
                        className="h-[5px] w-[5px] rounded-[1px] bg-warning-fg"
                        title="Alert triggered"
                      />
                    )}
                    {row.isCommitment && (
                      <span
                        className="h-[5px] w-[5px] rounded-[1px] bg-success-fg"
                        title="Commitment"
                      />
                    )}
                    {!(row.hasMemory || row.hasAlert || row.isCommitment) && (
                      <span className="h-[5px] w-[5px] opacity-0" />
                    )}
                  </div>

                  <div className="col-start-2 flex flex-wrap items-center gap-2">
                    <SpeakerChip
                      confidence={row.confidence}
                      name={row.speakerName || "Unknown"}
                      speakerType={row.speakerType || "unknown"}
                    />
                    <time className="font-mono text-[10px] text-fg-subtle tabular-nums">
                      {formatUtteranceClock(meetingStartedAtMs, row.timestamp)}
                    </time>
                    {row.isCommitment && (
                      <span className="inline-flex h-[14px] items-center rounded-[2px] border border-success-fg/25 bg-success-bg px-1 font-medium text-[9px] text-success-fg">
                        Commitment
                      </span>
                    )}
                  </div>

                  <p className="col-start-2 m-0 font-mono text-[13px] text-fg leading-relaxed">
                    {row.text}
                  </p>
                </div>
              ))}

              {pendingFinals.map((row) => (
                <div
                  className="group grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-border-subtle border-b py-2 pr-3 opacity-60"
                  key={row.key}
                >
                  <div
                    aria-hidden
                    className="flex w-5 shrink-0 flex-col items-center pt-1"
                  >
                    <span className="h-[5px] w-[5px] animate-pulse rounded-[1px] bg-fg-subtle/40" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cx(
                        "inline-flex h-[18px] items-center gap-[5px] rounded-[3px] border border-border-strong border-dashed bg-transparent px-[6px] font-medium font-sans text-[11px] text-fg-subtle leading-none"
                      )}
                    >
                      <span className="inline-block h-[5px] w-[5px] shrink-0 rounded-[1px] bg-fg-subtle" />
                      Processing · {captureChannelLabel(row.channel)}
                    </span>
                    <time className="font-mono text-[10px] text-fg-subtle tabular-nums">
                      {formatUtteranceClock(meetingStartedAtMs, row.ts)}
                    </time>
                  </div>
                  <p className="col-start-2 m-0 font-mono text-[13px] text-fg-muted leading-relaxed">
                    {row.text}
                  </p>
                </div>
              ))}

              {livePartial?.text?.trim() && (
                <div className="group grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-border-subtle border-b py-2 pr-3">
                  <div
                    aria-hidden
                    className="flex w-5 shrink-0 flex-col items-center pt-1"
                  >
                    <span
                      className="h-[5px] w-[5px] rounded-[1px]"
                      style={{
                        background: "hsl(var(--grad-hue, 252) 70% 60%)",
                        animation: "speak-pulse 1s ease-in-out infinite",
                      }}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={cx(
                        "inline-flex h-[18px] items-center gap-[5px] rounded-[3px] border border-white/[0.12] border-dashed bg-transparent px-[6px] font-medium font-sans text-[11px] text-fg-muted leading-none"
                      )}
                    >
                      <span
                        className="inline-block h-[5px] w-[5px] shrink-0 animate-pulse rounded-[1px]"
                        style={{
                          background: "hsl(var(--grad-hue,252) 70% 60%)",
                        }}
                      />
                      Speaking · {captureChannelLabel(livePartial.channel)}
                    </span>
                    <time className="font-mono text-[10px] text-fg-subtle tabular-nums">
                      {formatUtteranceClock(meetingStartedAtMs, livePartial.ts)}
                    </time>
                  </div>

                  <p className="col-start-2 m-0 font-mono text-[13px] text-fg-muted leading-relaxed after:ml-0.5 after:animate-pulse after:font-medium after:text-[hsl(var(--grad-hue,252)_70%_60%)] after:content-['▍']">
                    {livePartial.text}
                  </p>
                </div>
              )}
            </div>
          )}

          {!listIsEmpty && mode === "commitments" && (
            <div className="pb-4">
              {commitmentsByBlock.map(({ speaker, rows }) => (
                <div key={speaker}>
                  <div className="sticky top-0 z-10 flex items-center gap-2 border-border-subtle border-b bg-bg px-5 py-1.5">
                    <SpeakerChip
                      name={speaker}
                      speakerType={rows[0].speakerType || "unknown"}
                    />
                    <span className="font-mono text-[10px] text-fg-subtle">
                      {rows.length} commitment{rows.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="pl-2">
                    {rows.map((row) => (
                      <div
                        className="group grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-border-subtle border-b py-2 pr-3 last:border-b-0 hover:bg-bg-subtle/60"
                        id={`utterance-${row.id}`}
                        key={row.id}
                      >
                        <div
                          aria-hidden
                          className="col-start-1 row-span-2 flex w-5 shrink-0 flex-col items-center gap-1 pt-1"
                        >
                          {row.hasMemory && (
                            <span
                              className="h-[5px] w-[5px] rounded-[1px] bg-accent"
                              title="Remembered"
                            />
                          )}
                          {row.hasAlert && (
                            <span
                              className="h-[5px] w-[5px] rounded-[1px] bg-warning-fg"
                              title="Alert triggered"
                            />
                          )}
                          {row.isCommitment && (
                            <span
                              className="h-[5px] w-[5px] rounded-[1px] bg-success-fg"
                              title="Commitment"
                            />
                          )}
                          {!(
                            row.hasMemory ||
                            row.hasAlert ||
                            row.isCommitment
                          ) && <span className="h-[5px] w-[5px] opacity-0" />}
                        </div>

                        <div className="col-start-2 flex flex-wrap items-center gap-2">
                          <time className="font-mono text-[10px] text-fg-subtle tabular-nums">
                            {formatUtteranceClock(
                              meetingStartedAtMs,
                              row.timestamp
                            )}
                          </time>
                          {row.isCommitment && (
                            <span className="inline-flex h-[14px] items-center rounded-[2px] border border-success-fg/25 bg-success-bg px-1 font-medium text-[9px] text-success-fg">
                              Commitment
                            </span>
                          )}
                        </div>

                        <p className="col-start-2 m-0 font-mono text-[13px] text-fg leading-relaxed">
                          {row.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showJump && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <button
              className={cx(
                "pointer-events-auto inline-flex h-7 items-center gap-1.5 rounded-[5px] px-3",
                "border border-border-strong/50 bg-bg-elevated/90 backdrop-blur-sm",
                "font-medium text-[11px] text-fg-muted shadow-[var(--shadow-popover)]",
                "transition-all duration-150 hover:border-border-strong hover:text-fg"
              )}
              onClick={scrollToBottom}
              type="button"
            >
              <ChevronsDown size={12} strokeWidth={2} />
              Jump to now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
