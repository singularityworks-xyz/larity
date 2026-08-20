import type { MeetingAnalysis } from "@larity/db/meeting-analysis.types";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  FileDigit,
  FileText,
  HelpCircle,
  Lightbulb,
  ListTodo,
  MessageSquare,
  RefreshCcw,
  Target,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
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
import { cx } from "../../lib/ui";

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

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

// ── Processing Status Banner ─────────────────────────────────────────────────

function InProgressBanner({
  status,
}: {
  status: ProcessingStatus | undefined;
}) {
  return (
    <motion.div
      animate="show"
      aria-live="polite"
      className="relative overflow-hidden rounded-xl border border-info/20 bg-info/10 p-4 backdrop-blur-sm"
      initial="hidden"
      variants={itemVariants}
    >
      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-info/0 via-info/5 to-info/0" />
      <div className="relative z-10 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info/20 text-info">
          <RefreshCcw className="h-5 w-5 animate-spin" />
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-info text-sm">
            {status?.steps.transcribe === "processing" ||
            status?.steps.transcribe === "queued"
              ? "Transcribing meeting audio…"
              : "Extracting insights from transcript…"}
          </span>
          <span className="font-mono text-info/70 text-xs">
            {status?.steps.transcribe === "done"
              ? "transcribe ✓"
              : (status?.steps.transcribe ?? "transcribe…")}{" "}
            ·{" "}
            {status?.steps.summary === "done"
              ? "summary ✓"
              : (status?.steps.summary ?? "summary…")}
          </span>
        </div>
      </div>
    </motion.div>
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
  const isNoTranscript = status?.errorReason === "NO_TRANSCRIPT";
  return (
    <motion.div
      animate="show"
      aria-live="assertive"
      className="relative overflow-hidden rounded-xl border border-danger/30 bg-danger/10 p-4 backdrop-blur-sm"
      initial="hidden"
      variants={itemVariants}
    >
      <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/20 text-danger">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <span className="font-semibold text-danger text-sm">
            {isNoTranscript
              ? "Processing failed: No transcript available."
              : `Processing failed. ${status?.steps.transcribe === "failed" ? "Transcription step failed." : "Insight extraction failed."}`}
          </span>
          {isNoTranscript && (
            <p className="mt-1 text-danger/80 text-xs">
              This usually happens when the meeting didn't have any
              transcriptions (e.g. the meeting was just accidental).
            </p>
          )}
        </div>
        <button
          className="shrink-0 rounded-lg bg-danger px-4 py-2 font-semibold text-white text-xs transition-all hover:bg-danger/90 active:scale-95 disabled:opacity-50"
          disabled={reprocess.isPending || isNoTranscript}
          onClick={() =>
            reprocess.mutate(undefined, { onSuccess: onReprocessSuccess })
          }
          type="button"
        >
          {reprocess.isPending ? "Re-queuing…" : "Try Again"}
        </button>
      </div>
      {reprocess.error && (
        <div className="mt-2 font-medium text-danger text-xs">
          Error: {reprocess.error.message}
        </div>
      )}
    </motion.div>
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
    <motion.div
      animate="show"
      className="flex flex-col gap-4"
      initial="hidden"
      variants={containerVariants}
    >
      {ids.map((id) => (
        <motion.div
          className="overflow-hidden rounded-xl border border-border/50 bg-bg-elevated p-5 shadow-sm"
          key={id}
          variants={itemVariants}
        >
          <div className="mb-3 h-4 w-1/3 animate-pulse rounded bg-border" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-border/50" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-border/30" />
        </motion.div>
      ))}
    </motion.div>
  );
}

// ── Status Badges & Chips ───────────────────────────────────────────────────

function DecisionStatusBadge({ status }: { status: Decision["status"] }) {
  if (status === "SUPERSEDED") {
    return (
      <span className="inline-flex items-center rounded-full border border-fg-muted/30 bg-bg-subtle px-2 py-0.5 font-bold text-[10px] text-fg-muted uppercase tracking-wider line-through">
        Superseded
      </span>
    );
  }
  if (status === "REVOKED") {
    return (
      <span className="inline-flex items-center rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 font-bold text-[10px] text-danger uppercase tracking-wider">
        Revoked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-success/30 bg-success/10 px-2 py-0.5 font-bold text-[10px] text-success uppercase tracking-wider shadow-[0_0_10px_rgba(var(--color-success),0.1)]">
      Active
    </span>
  );
}

function PriorityChip({ priority }: { priority: TaskPriority }) {
  const classMap: Record<TaskPriority, string> = {
    CRITICAL:
      "border-danger/30 bg-danger/10 text-danger shadow-[0_0_10px_rgba(var(--color-danger),0.1)]",
    HIGH: "border-warning/30 bg-warning/10 text-warning shadow-[0_0_10px_rgba(var(--color-warning),0.1)]",
    MEDIUM: "border-accent/30 bg-accent/10 text-accent",
    LOW: "border-border bg-bg-subtle text-fg-muted",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-bold text-[10px] uppercase tracking-wider",
        classMap[priority]
      )}
    >
      {priority}
    </span>
  );
}

function TaskStatusChip({ status }: { status: Task["status"] }) {
  const classMap: Record<Task["status"], string> = {
    OPEN: "border-border bg-bg-subtle text-fg-muted",
    IN_PROGRESS: "border-accent/30 bg-accent/10 text-accent",
    BLOCKED: "border-danger/30 bg-danger/10 text-danger",
    DONE: "border-success/30 bg-success/10 text-success",
    CANCELLED: "border-border bg-bg-subtle text-fg-subtle line-through",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-bold text-[10px] uppercase tracking-wider",
        classMap[status]
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function CategoryChip({ category }: { category: ImportantPointCategory }) {
  const classMap: Record<
    ImportantPointCategory,
    { color: string; icon: React.ElementType }
  > = {
    COMMITMENT: {
      color: "border-accent/30 bg-accent/10 text-accent",
      icon: Target,
    },
    CONSTRAINT: {
      color: "border-warning/30 bg-warning/10 text-warning",
      icon: AlertTriangle,
    },
    INSIGHT: { color: "border-info/30 bg-info/10 text-info", icon: Lightbulb },
    WARNING: {
      color: "border-danger/30 bg-danger/10 text-danger",
      icon: AlertTriangle,
    },
    RISK: {
      color: "border-danger/50 bg-danger/20 text-danger",
      icon: AlertTriangle,
    },
    OPPORTUNITY: {
      color: "border-success/30 bg-success/10 text-success",
      icon: Zap,
    },
  };
  const config = classMap[category];
  const Icon = config.icon;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold text-[10px] uppercase tracking-wider",
        config.color
      )}
    >
      <Icon className="h-3 w-3" />
      {category}
    </span>
  );
}

// ── Tabs Components ─────────────────────────────────────────────────────────

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
      <p className="py-8 text-center font-medium text-fg-muted text-sm">
        No transcript available.
      </p>
    );
  }

  let utterances: TranscriptUtterance[] = [];
  try {
    utterances = JSON.parse(transcript.content) as TranscriptUtterance[];
  } catch {
    return (
      <p className="py-8 text-center font-medium text-fg-muted text-sm">
        Transcript content could not be parsed.
      </p>
    );
  }

  if (utterances.length === 0) {
    return (
      <p className="py-8 text-center font-medium text-fg-muted text-sm">
        Transcript is empty.
      </p>
    );
  }

  return (
    <motion.div
      animate="show"
      className="flex flex-col gap-4"
      initial="hidden"
      variants={containerVariants}
    >
      {utterances.map((u, i) => (
        <motion.div
          className="group relative flex gap-4 overflow-hidden rounded-xl border border-border/50 bg-bg-elevated p-4 transition-all hover:border-border hover:shadow-md"
          key={u.id ?? `u-${i}`}
          variants={itemVariants}
        >
          <div className="absolute top-0 bottom-0 left-0 w-1 bg-gradient-to-b from-border to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="flex w-24 shrink-0 flex-col gap-1 pt-0.5">
            <span className="truncate font-bold font-heading text-fg text-sm tracking-tight">
              {u.speaker}
            </span>
            {u.type && (
              <span className="font-semibold text-[10px] text-accent uppercase tracking-wider">
                {u.type === "TEAM" ? "Team" : "External"}
              </span>
            )}
            <span className="flex items-center gap-1 font-mono text-fg-subtle text-xs">
              <Clock className="h-3 w-3" />
              {formatTimestamp(u.timestamp)}
            </span>
          </div>
          <p className="m-0 flex-1 text-fg/90 text-sm leading-relaxed">
            {u.text}
          </p>
        </motion.div>
      ))}
    </motion.div>
  );
}

function DecisionsTab({ decisions }: { decisions: Decision[] }) {
  const safeDecisions = Array.isArray(decisions) ? decisions : [];
  if (safeDecisions.length === 0) {
    return (
      <p className="py-8 text-center font-medium text-fg-muted text-sm">
        No decisions were extracted.
      </p>
    );
  }

  return (
    <motion.div
      animate="show"
      className="grid grid-cols-1 gap-4 md:grid-cols-2"
      initial="hidden"
      variants={containerVariants}
    >
      {safeDecisions.map((d) => (
        <motion.div
          className={cx(
            "group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border/60 bg-bg-elevated p-4 transition-all hover:border-accent/40 hover:shadow-sm",
            d.status !== "ACTIVE" && "opacity-60"
          )}
          key={d.id}
          variants={itemVariants}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DecisionStatusBadge status={d.status} />
            <span className="font-mono text-fg-subtle text-xs">
              v{d.version}
            </span>
          </div>
          <h3 className="m-0 font-bold font-heading text-base text-fg tracking-tight transition-colors group-hover:text-accent">
            {d.title}
          </h3>
          <p className="m-0 text-fg/80 text-sm leading-relaxed">{d.content}</p>
          {d.rationale && (
            <div className="mt-auto border-border/50 border-t pt-3">
              <p className="m-0 text-fg-subtle text-xs italic leading-relaxed">
                <span className="mr-1 font-semibold text-fg-muted not-italic">
                  Rationale:
                </span>
                {d.rationale}
              </p>
            </div>
          )}
          {d.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {d.tags.map((tag) => (
                <span
                  className="rounded-md bg-bg-subtle px-2 py-0.5 font-medium text-[10px] text-fg-muted transition-colors hover:bg-border/50 hover:text-fg"
                  key={tag}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}

function TasksTab({ tasks }: { tasks: Task[] }) {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  if (safeTasks.length === 0) {
    return (
      <p className="py-8 text-center font-medium text-fg-muted text-sm">
        No tasks were extracted.
      </p>
    );
  }

  return (
    <motion.div
      animate="show"
      className="flex flex-col gap-3"
      initial="hidden"
      variants={containerVariants}
    >
      {safeTasks.map((t) => (
        <motion.div
          className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-bg-elevated p-4 transition-all hover:border-border hover:shadow-md md:flex-row md:items-center"
          key={t.id}
          variants={itemVariants}
        >
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <PriorityChip priority={t.priority} />
              <TaskStatusChip status={t.status} />
            </div>
            <h3 className="m-0 font-bold font-heading text-base text-fg">
              {t.title}
            </h3>
            {t.description && (
              <p className="m-0 text-fg/80 text-sm leading-relaxed">
                {t.description}
              </p>
            )}
          </div>
          {t.dueAt && (
            <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-bg-subtle px-3 py-2 text-xs">
              <Clock className="h-3.5 w-3.5 text-fg-muted" />
              <span className="font-semibold text-fg-subtle">
                Due {formatDate(t.dueAt)}
              </span>
            </div>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}

function OpenQuestionsTab({ questions }: { questions: OpenQuestion[] }) {
  const safeQuestions = Array.isArray(questions) ? questions : [];
  if (safeQuestions.length === 0) {
    return (
      <p className="py-8 text-center font-medium text-fg-muted text-sm">
        No open questions were extracted.
      </p>
    );
  }

  return (
    <motion.div
      animate="show"
      className="grid grid-cols-1 gap-4 md:grid-cols-2"
      initial="hidden"
      variants={containerVariants}
    >
      {safeQuestions.map((q) => (
        <motion.div
          className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-bg-elevated p-4 transition-all hover:border-info/40 hover:bg-info/5 hover:shadow-sm"
          key={q.id}
          variants={itemVariants}
        >
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info">
              <HelpCircle className="h-4 w-4" />
            </div>
            <span
              className={cx(
                "inline-flex items-center rounded-full border px-2 py-0.5 font-bold text-[10px] uppercase tracking-wider",
                {
                  RESOLVED: "border-success/30 bg-success/10 text-success",
                  DEFERRED: "border-warning/30 bg-warning/10 text-warning",
                  OPEN: "border-border bg-bg-subtle text-fg-muted",
                }[q.status] ?? "border-border bg-bg-subtle text-fg-muted"
              )}
            >
              {q.status}
            </span>
          </div>
          <h3 className="m-0 font-semibold text-base text-fg leading-snug">
            {q.question}
          </h3>
          {q.context && (
            <p className="m-0 mt-auto border-border/40 border-t pt-3 text-fg-subtle text-sm leading-relaxed">
              {q.context}
            </p>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}

const IMPORTANT_POINT_ORDER: ImportantPointCategory[] = [
  "WARNING",
  "RISK",
  "CONSTRAINT",
  "COMMITMENT",
  "OPPORTUNITY",
  "INSIGHT",
];

function ImportantPointsTab({ points }: { points: ImportantPoint[] }) {
  const safePoints = Array.isArray(points) ? points : [];

  const grouped = useMemo(() => {
    const map = new Map<ImportantPointCategory, ImportantPoint[]>();
    for (const cat of IMPORTANT_POINT_ORDER) {
      map.set(cat, []);
    }
    for (const p of safePoints) {
      map.get(p.category)?.push(p);
    }
    return map;
  }, [safePoints]);

  if (safePoints.length === 0) {
    return (
      <p className="py-8 text-center font-medium text-fg-muted text-sm">
        No highlights were extracted.
      </p>
    );
  }

  return (
    <motion.div
      animate="show"
      className="flex flex-col gap-8"
      initial="hidden"
      variants={containerVariants}
    >
      {IMPORTANT_POINT_ORDER.map((cat) => {
        const items = grouped.get(cat) ?? [];
        if (items.length === 0) {
          return null;
        }
        return (
          <motion.section key={cat} variants={itemVariants}>
            <div className="mb-4 flex items-center gap-3 border-border/50 border-b pb-2">
              <CategoryChip category={cat} />
              <span className="rounded-full bg-bg-subtle px-2 py-0.5 font-mono text-[10px] text-fg-muted">
                {items.length} item{items.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {items.map((p) => (
                <div
                  className="group relative flex flex-col gap-2 overflow-hidden rounded-xl border border-border/50 bg-bg-elevated p-4 transition-all hover:border-border hover:shadow-md"
                  key={p.id}
                >
                  <p className="m-0 text-fg text-sm leading-relaxed">
                    {p.content}
                  </p>
                  {p.transcriptEvidence && (
                    <div className="mt-auto border-border/30 border-t pt-2">
                      <p className="m-0 line-clamp-2 font-mono text-[11px] text-fg-subtle leading-snug transition-all group-hover:line-clamp-none">
                        <span className="mr-1 font-semibold text-fg-muted">
                          Evidence:
                        </span>
                        "{p.transcriptEvidence}"
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.section>
        );
      })}
    </motion.div>
  );
}

function BriefTab({
  analysis,
}: {
  analysis: MeetingAnalysis | null | undefined;
}) {
  if (!analysis) {
    return (
      <p className="py-8 text-center font-medium text-fg-muted text-sm">
        No brief available.
      </p>
    );
  }

  const TONE_CLASSES: Record<string, string> = {
    POSITIVE:
      "border-success/30 bg-success/10 text-success shadow-[0_0_10px_rgba(var(--color-success),0.05)]",
    NEUTRAL: "border-border bg-bg-subtle text-fg-muted",
    MIXED:
      "border-warning/30 bg-warning/10 text-warning shadow-[0_0_10px_rgba(var(--color-warning),0.05)]",
    TENSE:
      "border-danger/30 bg-danger/10 text-danger shadow-[0_0_10px_rgba(var(--color-danger),0.05)]",
  };

  const SENTIMENT_CLASSES: Record<string, string> = {
    ENTHUSIASTIC:
      "border-success/50 bg-success/20 text-success shadow-[0_0_12px_rgba(var(--color-success),0.15)]",
    INTERESTED:
      "border-info/30 bg-info/10 text-info shadow-[0_0_10px_rgba(var(--color-info),0.05)]",
    NEUTRAL: "border-border bg-bg-subtle text-fg-muted",
    SKEPTICAL:
      "border-warning/30 bg-warning/10 text-warning shadow-[0_0_10px_rgba(var(--color-warning),0.05)]",
    HOSTILE:
      "border-danger/50 bg-danger/20 text-danger shadow-[0_0_12px_rgba(var(--color-danger),0.15)]",
  };

  const toneKey = (analysis.tone || "").toUpperCase();
  const sentimentKey = (analysis.clientSentiment || "").toUpperCase();

  const toneClass =
    TONE_CLASSES[toneKey] ?? "border-border bg-bg-subtle text-fg-muted";
  const sentimentClass =
    SENTIMENT_CLASSES[sentimentKey] ??
    "border-border bg-bg-subtle text-fg-muted";

  return (
    <motion.div
      animate="show"
      className="flex flex-col gap-4"
      initial="hidden"
      variants={containerVariants}
    >
      <motion.div
        className="relative overflow-hidden rounded-xl border border-border bg-bg-elevated p-4 shadow-sm"
        variants={itemVariants}
      >
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-accent/10 blur-[80px]" />
        <h3 className="mb-3 flex items-center gap-2 font-bold font-heading text-base text-fg">
          <BookOpen className="h-4 w-4 text-accent" />
          Executive Summary
        </h3>
        <p className="whitespace-pre-wrap text-fg/90 text-sm leading-relaxed">
          {analysis.prose}
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {analysis.purpose && (
          <motion.div
            className="rounded-xl border border-border bg-bg-elevated p-4 shadow-sm transition-all hover:shadow-md"
            variants={itemVariants}
          >
            <h4 className="mb-2 flex items-center gap-2 font-bold font-heading text-fg text-sm">
              <Target className="h-4 w-4 text-info" /> Purpose
            </h4>
            <p className="text-fg/80 text-sm leading-relaxed">
              {analysis.purpose}
            </p>
          </motion.div>
        )}
        {analysis.outcome && (
          <motion.div
            className="rounded-xl border border-border bg-bg-elevated p-4 shadow-sm transition-all hover:shadow-md"
            variants={itemVariants}
          >
            <h4 className="mb-2 flex items-center gap-2 font-bold font-heading text-fg text-sm">
              <CheckCircle2 className="h-4 w-4 text-success" /> Outcome
            </h4>
            <p className="text-fg/80 text-sm leading-relaxed">
              {analysis.outcome}
            </p>
          </motion.div>
        )}
      </div>

      <motion.div className="flex flex-wrap gap-2" variants={itemVariants}>
        <div
          className={cx(
            "flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-all",
            toneClass
          )}
        >
          <span className="font-semibold text-[10px] uppercase tracking-wider opacity-70">
            Tone
          </span>
          <span className="h-3 w-px bg-current/20" />
          <span className="font-bold text-xs">{analysis.tone}</span>
        </div>
        <div
          className={cx(
            "flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-all",
            sentimentClass
          )}
        >
          <span className="font-semibold text-[10px] uppercase tracking-wider opacity-70">
            Sentiment
          </span>
          <span className="h-3 w-px bg-current/20" />
          <span className="font-bold text-xs">{analysis.clientSentiment}</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

function NotesTab({ meetingId }: { meetingId: string }) {
  const [notes, setNotes] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`larity-meeting-notes-${meetingId}`);
      setNotes(stored || "");
    } catch {
      setNotes("");
    }
  }, [meetingId]);

  if (notes === null) {
    return <SkeletonRows count={1} />;
  }
  if (!notes.trim()) {
    return (
      <p className="py-8 text-center font-medium text-fg-muted text-sm">
        No personal notes were taken.
      </p>
    );
  }

  return (
    <motion.div
      animate="show"
      className="flex flex-col gap-4"
      initial="hidden"
      variants={containerVariants}
    >
      <motion.div
        className="rounded-xl border border-border bg-bg-elevated p-4 shadow-sm"
        variants={itemVariants}
      >
        <h3 className="mb-3 flex items-center gap-2 font-bold font-heading text-base text-fg">
          <FileDigit className="h-4 w-4 text-accent" />
          Personal Notes
        </h3>
        <div className="rounded-lg border border-border bg-bg-subtle p-4">
          <p className="m-0 whitespace-pre-wrap font-mono text-fg text-sm leading-relaxed">
            {notes}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Tab definitions ──────────────────────────────────────────────────────────

type TabId =
  | "brief"
  | "transcript"
  | "decisions"
  | "tasks"
  | "questions"
  | "points"
  | "notes";

interface Tab {
  count?: number;
  icon: React.ElementType;
  id: TabId;
  label: string;
}

// ── Tab Content Renderer ──────────────────────────────────────────────────────

function TabContent({
  activeTab,
  meetingId,
  insights,
  insightsLoading,
}: {
  activeTab: TabId;
  meetingId: string;
  insights: ReturnType<typeof useMeetingInsights>["data"];
  insightsLoading: boolean;
}) {
  const skeletonCount = activeTab === "brief" || activeTab === "points" ? 4 : 3;

  if (insightsLoading && activeTab !== "transcript" && activeTab !== "notes") {
    return <SkeletonRows count={skeletonCount} />;
  }

  switch (activeTab) {
    case "brief":
      return <BriefTab analysis={insights?.analysis} />;
    case "transcript":
      return <TranscriptTab meetingId={meetingId} />;
    case "notes":
      return <NotesTab meetingId={meetingId} />;
    case "decisions":
      return <DecisionsTab decisions={insights?.decisions ?? []} />;
    case "tasks":
      return <TasksTab tasks={insights?.tasks ?? []} />;
    case "questions":
      return <OpenQuestionsTab questions={insights?.openQuestions ?? []} />;
    case "points":
      return <ImportantPointsTab points={insights?.importantPoints ?? []} />;
    default:
      return null;
  }
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function MeetingPostPage() {
  const { meetingId = "" } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("brief");
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
    { id: "brief", label: "Brief", icon: FileText },
    { id: "transcript", label: "Transcript", icon: MessageSquare },
    { id: "notes", label: "Notes", icon: FileDigit },
    {
      id: "decisions",
      label: "Decisions",
      icon: Target,
      count: insights?.decisions.length,
    },
    {
      id: "tasks",
      label: "Tasks",
      icon: ListTodo,
      count: insights?.tasks.length,
    },
    {
      id: "questions",
      label: "Questions",
      icon: HelpCircle,
      count: insights?.openQuestions.length,
    },
    {
      id: "points",
      label: "Highlights",
      icon: Zap,
      count: insights?.importantPoints.length,
    },
  ];

  const handleReprocessSuccess = useCallback(() => {
    // Triggered by the ProcessingBanner; no additional action needed here
    // because query invalidation is already handled by the `complete` effect.
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-bg text-fg">
      <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col gap-4 overflow-hidden px-4 pt-12 pb-4 sm:px-6 sm:pt-14 sm:pb-6 md:px-8 md:pt-16 md:pb-6">
        {/* Hero Header */}
        <motion.div
          animate="show"
          className="relative shrink-0 overflow-hidden rounded-2xl border border-border/40 px-6 py-8 md:flex-row md:items-end"
          initial="hidden"
          variants={itemVariants}
        >
          <div
            className="pointer-events-none absolute inset-0 bg-bottom bg-cover opacity-50 mix-blend-overlay"
            style={{
              backgroundImage: "url(/images/larity-banner-full.png)",
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-bg-base/90 via-bg-base/50 to-bg-base/20" />
          <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-accent/20 blur-[120px]" />

          <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-4">
              <button
                aria-label="Go back"
                className="group flex w-max items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 font-semibold text-white/70 text-xs backdrop-blur-md transition-all [-webkit-app-region:no-drag] [app-region:no-drag] hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-95"
                onClick={() => navigate(-1)}
                type="button"
              >
                <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
                Back to Home
              </button>
              <div>
                <h1 className="font-bold font-heading text-3xl text-white tracking-tight drop-shadow-md sm:text-4xl">
                  Meeting Review
                </h1>
                <div className="mt-2 flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 font-mono text-white/90 text-xs backdrop-blur-sm">
                    ID: {meetingId}
                  </span>
                  {isProcessingComplete(polledStatus) && (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-success/20 px-2.5 py-1 font-bold text-[10px] text-success uppercase tracking-wider shadow-[0_0_15px_rgba(var(--color-success),0.2)] backdrop-blur-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      Analysis Ready
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isProcessingSettled(polledStatus) && (
                <div className="flex items-center gap-3">
                  {reprocess.error && (
                    <span className="font-medium text-danger text-xs">
                      {reprocess.error.message}
                    </span>
                  )}
                  <button
                    className="group relative flex items-center gap-2 overflow-hidden rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/20 active:scale-95 disabled:opacity-50"
                    disabled={reprocess.isPending}
                    onClick={() =>
                      reprocess.mutate(undefined, {
                        onSuccess: handleReprocessSuccess,
                      })
                    }
                    type="button"
                  >
                    <RefreshCcw
                      className={cx(
                        "h-4 w-4 text-white",
                        reprocess.isPending && "animate-spin"
                      )}
                    />
                    <span className="font-semibold text-white text-xs">
                      {reprocess.isPending ? "Re-queuing…" : "Reprocess"}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Main Content Area */}
        <main className="relative z-10 flex w-full flex-1 flex-col gap-4 overflow-hidden md:flex-row">
          {/* Sidebar / Tabs */}
          <div className="scrollbar-thin scrollbar-thumb-border-strong flex w-full shrink-0 flex-col gap-2 overflow-y-auto pr-2 pb-4 md:w-64">
            <ProcessingBanner
              meetingId={meetingId}
              onReprocessSuccess={handleReprocessSuccess}
            />

            <div className="flex flex-col gap-1 rounded-xl border border-border bg-bg-elevated p-2 shadow-sm">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    className={cx(
                      "relative flex w-full items-center justify-between rounded-lg px-3 py-2 font-semibold text-sm transition-colors duration-300",
                      isActive
                        ? "text-fg"
                        : "text-fg-muted hover:bg-bg-subtle/50 hover:text-fg"
                    )}
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    type="button"
                  >
                    {isActive && (
                      <motion.div
                        className="absolute inset-0 z-0 rounded-lg border border-border bg-bg-subtle shadow-sm"
                        layoutId="activeTab"
                        transition={{
                          type: "spring",
                          stiffness: 300,
                          damping: 25,
                        }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      <Icon
                        className={cx(
                          "h-4 w-4",
                          isActive ? "text-info" : "text-fg-muted/70"
                        )}
                      />
                      {tab.label}
                    </span>
                    {tab.count !== undefined && tab.count > 0 && (
                      <span
                        className={cx(
                          "relative z-10 ml-2 flex h-5 min-w-[20px] items-center justify-center rounded-md px-1.5 font-mono text-[10px] tabular-nums transition-colors",
                          isActive
                            ? "border border-info/20 bg-info/10 text-info"
                            : "bg-bg-emphasis/50 text-fg-muted"
                        )}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab content */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-[16px] border border-border bg-bg-elevated shadow-sm">
            <div className="flex items-center justify-between border-border/40 border-b bg-bg-subtle/50 px-4 py-3 backdrop-blur-sm">
              <h2 className="font-bold font-heading text-base text-fg tracking-tight">
                {tabs.find((t) => t.id === activeTab)?.label}
              </h2>
            </div>
            <div className="scrollbar-thin scrollbar-thumb-border-strong flex-1 overflow-y-auto p-4">
              <AnimatePresence mode="wait">
                <motion.div
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                  initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                  key={activeTab}
                  transition={{ duration: 0.2 }}
                >
                  <TabContent
                    activeTab={activeTab}
                    insights={insights}
                    insightsLoading={insightsLoading}
                    meetingId={meetingId}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
