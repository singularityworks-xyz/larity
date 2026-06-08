import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  Decision,
  ImportantPoint,
  ImportantPointCategory,
  OpenQuestion,
  ProcessingStatus,
  Task,
  TaskPriority,
  TranscriptUtterance,
} from "../../features/meeting-post/types";
import { useMeetingInsights } from "../../features/meeting-post/use-meeting-insights";
import { useMeetingTranscript } from "../../features/meeting-post/use-meeting-transcript";
import {
  isProcessingComplete,
  isProcessingInProgress,
  isProcessingSettled,
  useProcessingStatus,
} from "../../features/meeting-post/use-processing-status";
import { useReprocess } from "../../features/meeting-post/use-reprocess";
import {
  buttonClass,
  cx,
  panelClass,
  tabActiveClass,
  tabButtonClass,
  tabsRowClass,
} from "../../lib/ui";

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Processing Status Banner ─────────────────────────────────────────────────

function InProgressBanner({
  status,
}: {
  status: ProcessingStatus | undefined;
}) {
  return (
    <div
      aria-live="polite"
      className="flex items-center gap-2.5 rounded-[var(--radius-0)] border border-info-fg/20 bg-info-bg px-4 py-2.5"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info-fg/60 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-info-fg" />
      </span>
      <span className="flex-1 font-medium text-[12px] text-info-fg leading-snug">
        {status?.steps.transcribe === "processing" ||
        status?.steps.transcribe === "queued"
          ? "Transcribing meeting audio…"
          : "Extracting insights from transcript…"}
      </span>
      <span className="font-mono text-[10px] text-info-fg/60">
        {status?.steps.transcribe === "done"
          ? "transcribe ✓"
          : (status?.steps.transcribe ?? "transcribe…")}{" "}
        ·{" "}
        {status?.steps.summary === "done"
          ? "summary ✓"
          : (status?.steps.summary ?? "summary…")}
      </span>
    </div>
  );
}

function FailedBanner({
  status,
  reprocess,
  onReprocessSuccess,
}: {
  status: ProcessingStatus | undefined;
  reprocess: ReturnType<typeof useReprocess>;
  onReprocessSuccess: () => void;
}) {
  return (
    <div
      aria-live="assertive"
      className="flex flex-col gap-2 rounded-[var(--radius-0)] border border-danger-fg/25 bg-danger-bg px-4 py-2.5"
    >
      <div className="flex items-center gap-3">
        <span className="flex-1 font-medium text-[12px] text-danger-fg leading-snug">
          Processing failed.{" "}
          {status?.steps.transcribe === "failed"
            ? "Transcription step failed."
            : "Insight extraction failed."}{" "}
          You can try again.
        </span>
        <button
          className={buttonClass({ size: "sm", variant: "danger" })}
          disabled={reprocess.isPending}
          onClick={() => {
            reprocess.mutate(undefined, { onSuccess: onReprocessSuccess });
          }}
          type="button"
        >
          {reprocess.isPending ? "Re-queuing…" : "Reprocess"}
        </button>
      </div>
      {reprocess.error && (
        <div className="font-medium text-[11px] text-danger-fg">
          Error: {reprocess.error.message}
        </div>
      )}
    </div>
  );
}

function ProcessingBanner({
  meetingId,
  onReprocessSuccess,
}: {
  meetingId: string;
  onReprocessSuccess: () => void;
}) {
  const { data: status, isLoading } = useProcessingStatus(meetingId, true);
  const reprocess = useReprocess(meetingId);

  const inProgress = isProcessingInProgress(status);
  const settled = isProcessingSettled(status);
  const complete = isProcessingComplete(status);
  const failed =
    settled &&
    !complete &&
    (status?.steps.transcribe === "failed" ||
      status?.steps.summary === "failed");

  if (isLoading || !(inProgress || settled)) {
    return null;
  }

  if (inProgress) {
    return <InProgressBanner status={status} />;
  }

  if (failed) {
    return (
      <FailedBanner
        onReprocessSuccess={onReprocessSuccess}
        reprocess={reprocess}
        status={status}
      />
    );
  }

  return null;
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonRows({ count = 4 }: { count?: number }) {
  const ids = useMemo(
    () => Array.from({ length: count }, (_, i) => `skeleton-row-${i}`),
    [count]
  );

  return (
    <div className="flex flex-col gap-3">
      {ids.map((id) => (
        <div
          className="animate-pulse rounded-[var(--radius-0)] border border-border bg-bg-elevated p-4"
          key={id}
        >
          <div className="mb-2 h-3 w-1/2 rounded-sm bg-bg-emphasis" />
          <div className="h-2.5 w-3/4 rounded-sm bg-bg-subtle" />
        </div>
      ))}
    </div>
  );
}

// ── Decision Status Badge ────────────────────────────────────────────────────

function DecisionStatusBadge({ status }: { status: Decision["status"] }) {
  if (status === "SUPERSEDED") {
    return (
      <span className="inline-flex h-[16px] items-center rounded-[3px] border border-border bg-bg-subtle px-1.5 font-medium text-[9px] text-fg-subtle uppercase line-through">
        superseded
      </span>
    );
  }
  if (status === "REVOKED") {
    return (
      <span className="inline-flex h-[16px] items-center rounded-[3px] border border-danger-fg/25 bg-danger-bg px-1.5 font-medium text-[9px] text-danger-fg uppercase">
        revoked
      </span>
    );
  }
  return (
    <span className="inline-flex h-[16px] items-center rounded-[3px] border border-success-fg/25 bg-success-bg px-1.5 font-medium text-[9px] text-success-fg uppercase">
      active
    </span>
  );
}

// ── Task Priority Chip ───────────────────────────────────────────────────────

function PriorityChip({ priority }: { priority: TaskPriority }) {
  const classMap: Record<TaskPriority, string> = {
    CRITICAL: "border-danger-fg/25 bg-danger-bg text-danger-fg",
    HIGH: "border-warning-fg/25 bg-warning-bg text-warning-fg",
    MEDIUM: "border-accent/25 bg-accent-subtle text-accent",
    LOW: "border-border bg-bg-subtle text-fg-muted",
  };
  return (
    <span
      className={cx(
        "inline-flex h-[16px] items-center rounded-[3px] border px-1.5 font-medium text-[9px] uppercase",
        classMap[priority]
      )}
    >
      {priority.toLowerCase()}
    </span>
  );
}

// ── Task Status Chip ─────────────────────────────────────────────────────────

function TaskStatusChip({ status }: { status: Task["status"] }) {
  const classMap: Record<Task["status"], string> = {
    OPEN: "border-border bg-bg-subtle text-fg-muted",
    IN_PROGRESS: "border-accent/25 bg-accent-subtle text-accent",
    BLOCKED: "border-danger-fg/25 bg-danger-bg text-danger-fg",
    DONE: "border-success-fg/25 bg-success-bg text-success-fg",
    CANCELLED: "border-border bg-bg-subtle text-fg-subtle line-through",
  };
  return (
    <span
      className={cx(
        "inline-flex h-[16px] items-center rounded-[3px] border px-1.5 font-medium text-[9px] uppercase",
        classMap[status]
      )}
    >
      {status.toLowerCase().replace("_", " ")}
    </span>
  );
}

// ── Important Point Category Chip ────────────────────────────────────────────

function CategoryChip({ category }: { category: ImportantPointCategory }) {
  const classMap: Record<ImportantPointCategory, string> = {
    COMMITMENT: "border-accent/30 bg-accent-subtle text-accent",
    CONSTRAINT: "border-warning-fg/25 bg-warning-bg text-warning-fg",
    INSIGHT: "border-border bg-bg-subtle text-fg-muted",
    WARNING: "border-danger-fg/25 bg-danger-bg text-danger-fg",
    RISK: "border-danger-fg/40 bg-danger-bg text-danger-fg",
    OPPORTUNITY: "border-success-fg/25 bg-success-bg text-success-fg",
  };
  return (
    <span
      className={cx(
        "inline-flex h-[16px] items-center rounded-[3px] border px-1.5 font-medium text-[9px] uppercase",
        classMap[category]
      )}
    >
      {category.toLowerCase()}
    </span>
  );
}

// ── Tab: Transcript ──────────────────────────────────────────────────────────

function TranscriptTab({ meetingId }: { meetingId: string }) {
  const {
    data: transcript,
    isLoading,
    error,
  } = useMeetingTranscript(meetingId);

  if (isLoading) {
    return <SkeletonRows count={6} />;
  }

  if (error || !transcript) {
    return (
      <p className="py-4 text-center text-[12px] text-fg-muted">
        No transcript available.
      </p>
    );
  }

  let utterances: TranscriptUtterance[] = [];
  try {
    utterances = JSON.parse(transcript.content) as TranscriptUtterance[];
  } catch {
    return (
      <p className="py-4 text-center text-[12px] text-fg-muted">
        Transcript content could not be parsed.
      </p>
    );
  }

  if (utterances.length === 0) {
    return (
      <p className="py-4 text-center text-[12px] text-fg-muted">
        Transcript is empty.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {utterances.map((u, i) => (
        <div
          className="group flex gap-3 border-border-subtle border-b py-3 last:border-b-0"
          key={u.id ?? `u-${i}`}
        >
          <div className="flex w-[100px] shrink-0 flex-col gap-0.5 pt-0.5">
            <span className="truncate font-medium text-[11px] text-fg leading-snug">
              {u.speaker}
            </span>
            {u.type && (
              <span className="font-semibold text-[9px] text-fg-muted uppercase tracking-wider">
                {u.type === "TEAM" ? "Team Member" : "External"}
              </span>
            )}
            <span className="font-mono text-[10px] text-fg-subtle">
              {formatTimestamp(u.timestamp)}
            </span>
          </div>
          <p className="m-0 flex-1 text-[13px] text-fg leading-relaxed">
            {u.text}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Tab: Decisions ───────────────────────────────────────────────────────────

function DecisionsTab({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) {
    return (
      <p className="py-4 text-center text-[12px] text-fg-muted">
        No decisions were extracted from this meeting.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {decisions.map((d) => (
        <div
          className={cx(
            panelClass,
            "grid gap-2",
            d.status !== "ACTIVE" && "opacity-60"
          )}
          key={d.id}
        >
          <div className="flex flex-wrap items-start gap-2">
            <DecisionStatusBadge status={d.status} />
            <span className="font-medium text-[11px] text-fg-subtle">
              v{d.version}
            </span>
            <span className="ml-auto font-medium text-[10px] text-fg-subtle">
              {formatDate(d.createdAt)}
            </span>
          </div>
          <h3 className="m-0 font-semibold text-[13px] text-fg leading-snug">
            {d.title}
          </h3>
          <p className="m-0 text-[12.5px] text-fg-muted leading-relaxed">
            {d.content}
          </p>
          {d.rationale && (
            <p className="m-0 border-border-subtle border-t pt-2 text-[11.5px] text-fg-subtle italic leading-relaxed">
              Rationale: {d.rationale}
            </p>
          )}
          {d.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {d.tags.map((tag) => (
                <span
                  className="rounded-[3px] border border-border-subtle bg-bg-subtle px-1.5 py-px font-medium text-[10px] text-fg-subtle"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Tab: Tasks ───────────────────────────────────────────────────────────────

function TasksTab({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return (
      <p className="py-4 text-center text-[12px] text-fg-muted">
        No tasks were extracted from this meeting.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {tasks.map((t) => (
        <div className={cx(panelClass, "grid gap-2")} key={t.id}>
          <div className="flex flex-wrap items-center gap-2">
            <PriorityChip priority={t.priority} />
            <TaskStatusChip status={t.status} />
            {t.dueAt && (
              <span className="ml-auto font-medium text-[10px] text-fg-subtle">
                Due {formatDate(t.dueAt)}
              </span>
            )}
          </div>
          <p className="m-0 font-medium text-[13px] text-fg leading-snug">
            {t.title}
          </p>
          {t.description && (
            <p className="m-0 text-[12px] text-fg-muted leading-relaxed">
              {t.description}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Tab: Open Questions ──────────────────────────────────────────────────────

function OpenQuestionsTab({ questions }: { questions: OpenQuestion[] }) {
  if (questions.length === 0) {
    return (
      <p className="py-4 text-center text-[12px] text-fg-muted">
        No open questions were extracted from this meeting.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {questions.map((q) => (
        <div className={cx(panelClass, "grid gap-2")} key={q.id}>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cx(
                "inline-flex h-[16px] items-center rounded-[3px] border px-1.5 font-medium text-[9px] uppercase",
                {
                  RESOLVED:
                    "border-success-fg/25 bg-success-bg text-success-fg",
                  DEFERRED:
                    "border-warning-fg/25 bg-warning-bg text-warning-fg",
                  OPEN: "border-border bg-bg-subtle text-fg-muted",
                }[q.status] ?? "border-border bg-bg-subtle text-fg-muted"
              )}
            >
              {q.status.toLowerCase()}
            </span>
            <span className="ml-auto font-medium text-[10px] text-fg-subtle">
              {formatDate(q.createdAt)}
            </span>
          </div>
          <p className="m-0 font-medium text-[13px] text-fg leading-snug">
            {q.question}
          </p>
          {q.context && (
            <p className="m-0 text-[12px] text-fg-muted leading-relaxed">
              {q.context}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Tab: Important Points ────────────────────────────────────────────────────

function ImportantPointsTab({ points }: { points: ImportantPoint[] }) {
  const ORDER: ImportantPointCategory[] = [
    "WARNING",
    "RISK",
    "CONSTRAINT",
    "COMMITMENT",
    "OPPORTUNITY",
    "INSIGHT",
  ];

  const grouped = useMemo(() => {
    const map = new Map<ImportantPointCategory, ImportantPoint[]>();
    for (const cat of ORDER) {
      map.set(cat, []);
    }
    for (const p of points) {
      const arr = map.get(p.category);
      if (arr) {
        arr.push(p);
      }
    }
    return map;
  }, [points]);

  if (points.length === 0) {
    return (
      <p className="py-4 text-center text-[12px] text-fg-muted">
        No important points were extracted from this meeting.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {ORDER.map((cat) => {
        const items = grouped.get(cat) ?? [];
        if (items.length === 0) {
          return null;
        }
        return (
          <section key={cat}>
            <div className="mb-2 flex items-center gap-2">
              <CategoryChip category={cat} />
              <span className="font-medium text-[10px] text-fg-subtle">
                {items.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {items.map((p) => (
                <div
                  className="rounded-[var(--radius-0)] border border-border-subtle bg-bg-elevated px-4 py-3"
                  key={p.id}
                >
                  <p className="m-0 text-[13px] text-fg leading-relaxed">
                    {p.content}
                  </p>
                  {p.transcriptEvidence && (
                    <p className="m-0 mt-1.5 font-mono text-[10px] text-fg-subtle/60 leading-snug">
                      Evidence: {p.transcriptEvidence.slice(0, 100)}
                      {p.transcriptEvidence.length > 100 ? "…" : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── Tab definitions ──────────────────────────────────────────────────────────

type TabId = "transcript" | "decisions" | "tasks" | "questions" | "points";

interface Tab {
  id: TabId;
  label: string;
  count?: number;
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function MeetingPostPage() {
  const { meetingId = "" } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("decisions");
  const queryClient = useQueryClient();

  const { data: insights, isLoading: insightsLoading } =
    useMeetingInsights(meetingId);
  const { data: status } = useProcessingStatus(
    meetingId,
    !isProcessingSettled(undefined)
  );

  const reprocess = useReprocess(meetingId);
  const settled = isProcessingSettled(status);

  const { data: polledStatus } = useProcessingStatus(meetingId, !settled);
  const complete = isProcessingComplete(polledStatus);

  useEffect(() => {
    if (complete) {
      queryClient.invalidateQueries({
        queryKey: ["meeting-insights", meetingId],
      });
      queryClient.invalidateQueries({
        queryKey: ["meeting-transcript", meetingId],
      });
    }
  }, [complete, meetingId, queryClient]);

  const tabs: Tab[] = [
    {
      id: "transcript",
      label: "Transcript",
    },
    {
      id: "decisions",
      label: "Decisions",
      count: insights?.decisions.length,
    },
    {
      id: "tasks",
      label: "Tasks",
      count: insights?.tasks.length,
    },
    {
      id: "questions",
      label: "Questions",
      count: insights?.openQuestions.length,
    },
    {
      id: "points",
      label: "Highlights",
      count: insights?.importantPoints.length,
    },
  ];

  const handleReprocessSuccess = useCallback(() => {
    // status poll will restart automatically via query invalidation
  }, []);

  return (
    <div className="mx-auto grid w-full gap-4 pb-8">
      {/* Back + header */}
      <div className={cx(panelClass, "flex items-start gap-4")}>
        <div className="min-w-0 flex-1">
          <button
            className="mb-2 inline-flex items-center gap-1 font-medium text-[11px] text-fg-muted transition-colors hover:text-fg"
            onClick={() => navigate("/home")}
            type="button"
          >
            ← Back to Home
          </button>
          <h1 className="my-0 font-semibold text-[16px] text-fg leading-snug">
            Meeting Review
          </h1>
          <p className="m-0 mt-0.5 text-[12px] text-fg-muted">
            Session{" "}
            <code className="rounded bg-bg-emphasis px-1 py-px font-mono text-[11px]">
              {meetingId}
            </code>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isProcessingSettled(polledStatus) && (
            <div className="flex items-center gap-2">
              {reprocess.error && (
                <span className="font-medium text-[11px] text-danger-fg">
                  {reprocess.error.message}
                </span>
              )}
              <button
                className={buttonClass({ size: "sm", variant: "secondary" })}
                disabled={reprocess.isPending}
                onClick={() =>
                  reprocess.mutate(undefined, {
                    onSuccess: handleReprocessSuccess,
                  })
                }
                type="button"
              >
                {reprocess.isPending ? "Re-queuing…" : "Reprocess"}
              </button>
            </div>
          )}
          {isProcessingComplete(polledStatus) && (
            <span className="inline-flex h-[18px] items-center gap-1 rounded-[3px] border border-success-fg/25 bg-success-bg px-2 font-medium text-[10px] text-success-fg">
              <span className="h-1.5 w-1.5 rounded-full bg-success-fg" />
              Ready
            </span>
          )}
        </div>
      </div>

      {/* Processing banner */}
      <ProcessingBanner
        meetingId={meetingId}
        onReprocessSuccess={handleReprocessSuccess}
      />

      {/* Tabs + content */}
      <div className={panelClass}>
        {/* Tab bar */}
        <div className={cx(tabsRowClass, "mb-4")}>
          {tabs.map((tab) => (
            <button
              className={cx(
                tabButtonClass,
                activeTab === tab.id && tabActiveClass
              )}
              id={`tab-${tab.id}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1.5 inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-[2px] bg-bg-emphasis px-1 font-mono text-[9px] text-fg-muted tabular-nums">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div aria-labelledby={`tab-${activeTab}`} role="tabpanel">
          {activeTab === "transcript" && (
            <TranscriptTab meetingId={meetingId} />
          )}

          {activeTab === "decisions" &&
            (insightsLoading ? (
              <SkeletonRows count={3} />
            ) : (
              <DecisionsTab decisions={insights?.decisions ?? []} />
            ))}

          {activeTab === "tasks" &&
            (insightsLoading ? (
              <SkeletonRows count={3} />
            ) : (
              <TasksTab tasks={insights?.tasks ?? []} />
            ))}

          {activeTab === "questions" &&
            (insightsLoading ? (
              <SkeletonRows count={3} />
            ) : (
              <OpenQuestionsTab questions={insights?.openQuestions ?? []} />
            ))}

          {activeTab === "points" &&
            (insightsLoading ? (
              <SkeletonRows count={4} />
            ) : (
              <ImportantPointsTab points={insights?.importantPoints ?? []} />
            ))}
        </div>
      </div>
    </div>
  );
}
