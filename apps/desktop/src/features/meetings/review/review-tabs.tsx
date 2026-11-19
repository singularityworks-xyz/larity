import type { MeetingAnalysis } from "@larity/db/meeting-analysis.types";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  FileDigit,
  HelpCircle,
  Lightbulb,
  Target,
  Zap,
} from "lucide-react";
import type React from "react";
import { memo, useEffect, useMemo, useState } from "react";
import { cx } from "../../../lib/ui";
import type {
  Decision,
  ImportantPoint,
  ImportantPointCategory,
  OpenQuestion,
  Task,
  TaskPriority,
  TranscriptUtterance,
} from "./types";
import type { useMeetingInsights } from "./use-meeting-insights";
import { useMeetingTranscript } from "./use-meeting-transcript";

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

const SKELETON_ROW_KEYS = [
  "post-sk-row-1",
  "post-sk-row-2",
  "post-sk-row-3",
  "post-sk-row-4",
  "post-sk-row-5",
  "post-sk-row-6",
] as const;

function SkeletonRows({ count = 4 }: { count?: number }) {
  const rows = SKELETON_ROW_KEYS.slice(0, count);
  return (
    <div className="fade-in flex animate-in flex-col gap-4 duration-200">
      {rows.map((rowKey) => (
        <div
          className="overflow-hidden rounded-xl border border-border/50 bg-bg-elevated p-5 shadow-sm"
          key={rowKey}
        >
          <div className="mb-3 h-4 w-1/3 animate-pulse rounded bg-border" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-border/50" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-border/30" />
        </div>
      ))}
    </div>
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

// ── Memoized Tab Components ──────────────────────────────────────────────────

const TranscriptRow = memo(function TranscriptRow({
  utterance,
  index,
}: {
  utterance: TranscriptUtterance;
  index: number;
}) {
  return (
    <div
      className="group relative flex gap-4 overflow-hidden rounded-xl border border-border/50 bg-bg-elevated p-4 transition-all hover:border-border hover:shadow-md"
      key={utterance.id ?? `u-${index}`}
    >
      <div className="absolute top-0 bottom-0 left-0 w-1 bg-gradient-to-b from-border to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex w-24 shrink-0 flex-col gap-1 pt-0.5">
        <span className="truncate font-bold font-heading text-fg text-sm tracking-tight">
          {utterance.speaker}
        </span>
        {utterance.type && (
          <span className="font-semibold text-[10px] text-accent uppercase tracking-wider">
            {utterance.type === "TEAM" ? "Team" : "External"}
          </span>
        )}
        <span className="flex items-center gap-1 font-mono text-fg-subtle text-xs">
          <Clock className="h-3 w-3" />
          {formatTimestamp(utterance.timestamp)}
        </span>
      </div>
      <p className="m-0 flex-1 text-fg/90 text-sm leading-relaxed">
        {utterance.text}
      </p>
    </div>
  );
});

function TranscriptTab({ meetingId }: { meetingId: string }) {
  const {
    data: transcript,
    isLoading,
    error,
  } = useMeetingTranscript(meetingId);

  const utterances = useMemo(() => {
    if (!transcript?.content) {
      return [];
    }
    try {
      return JSON.parse(transcript.content) as TranscriptUtterance[];
    } catch {
      return [];
    }
  }, [transcript?.content]);

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

  if (utterances.length === 0) {
    return (
      <p className="py-8 text-center font-medium text-fg-muted text-sm">
        Transcript is empty or could not be parsed.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {utterances.map((u, i) => (
        <TranscriptRow index={i} key={u.id ?? `u-${i}`} utterance={u} />
      ))}
    </div>
  );
}

const DecisionCard = memo(function DecisionCard({
  decision: d,
}: {
  decision: Decision;
}) {
  return (
    <div
      className={cx(
        "group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border/60 bg-bg-elevated p-4 transition-all hover:border-accent/40 hover:shadow-sm",
        d.status !== "ACTIVE" && "opacity-60"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DecisionStatusBadge status={d.status} />
        <span className="font-mono text-fg-subtle text-xs">v{d.version}</span>
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
    </div>
  );
});

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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {safeDecisions.map((d) => (
        <DecisionCard decision={d} key={d.id} />
      ))}
    </div>
  );
}

const TaskCard = memo(function TaskCard({ task: t }: { task: Task }) {
  return (
    <div className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-bg-elevated p-4 transition-all hover:border-border hover:shadow-md md:flex-row md:items-center">
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
    </div>
  );
});

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
    <div className="flex flex-col gap-3">
      {safeTasks.map((t) => (
        <TaskCard key={t.id} task={t} />
      ))}
    </div>
  );
}

const QuestionCard = memo(function QuestionCard({
  question: q,
}: {
  question: OpenQuestion;
}) {
  return (
    <div className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-bg-elevated p-4 transition-all hover:border-info/40 hover:bg-info/5 hover:shadow-sm">
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
    </div>
  );
});

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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {safeQuestions.map((q) => (
        <QuestionCard key={q.id} question={q} />
      ))}
    </div>
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

const PointCard = memo(function PointCard({
  point: p,
}: {
  point: ImportantPoint;
}) {
  return (
    <div className="group relative flex flex-col gap-2 overflow-hidden rounded-xl border border-border/50 bg-bg-elevated p-4 transition-all hover:border-border hover:shadow-md">
      <p className="m-0 text-fg text-sm leading-relaxed">{p.content}</p>
      {p.transcriptEvidence && (
        <div className="mt-auto border-border/30 border-t pt-2">
          <p className="m-0 line-clamp-2 font-mono text-[11px] text-fg-subtle leading-snug transition-all group-hover:line-clamp-none">
            <span className="mr-1 font-semibold text-fg-muted">Evidence:</span>"
            {p.transcriptEvidence}"
          </p>
        </div>
      )}
    </div>
  );
});

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
    <div className="flex flex-col gap-8">
      {IMPORTANT_POINT_ORDER.map((cat) => {
        const items = grouped.get(cat) ?? [];
        if (items.length === 0) {
          return null;
        }
        return (
          <section key={cat}>
            <div className="mb-4 flex items-center gap-3 border-border/50 border-b pb-2">
              <CategoryChip category={cat} />
              <span className="rounded-full bg-bg-subtle px-2 py-0.5 font-mono text-[10px] text-fg-muted">
                {items.length} item{items.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {items.map((p) => (
                <PointCard key={p.id} point={p} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
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
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-xl border border-border bg-bg-elevated p-4 shadow-sm">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 transform-gpu rounded-full bg-accent/10 blur-[80px] will-change-transform" />
        <h3 className="mb-3 flex items-center gap-2 font-bold font-heading text-base text-fg">
          <BookOpen className="h-4 w-4 text-accent" />
          Executive Summary
        </h3>
        <p className="whitespace-pre-wrap text-fg/90 text-sm leading-relaxed">
          {analysis.prose}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {analysis.purpose && (
          <div className="rounded-xl border border-border bg-bg-elevated p-4 shadow-sm transition-all hover:shadow-md">
            <h4 className="mb-2 flex items-center gap-2 font-bold font-heading text-fg text-sm">
              <Target className="h-4 w-4 text-info" /> Purpose
            </h4>
            <p className="text-fg/80 text-sm leading-relaxed">
              {analysis.purpose}
            </p>
          </div>
        )}
        {analysis.outcome && (
          <div className="rounded-xl border border-border bg-bg-elevated p-4 shadow-sm transition-all hover:shadow-md">
            <h4 className="mb-2 flex items-center gap-2 font-bold font-heading text-fg text-sm">
              <CheckCircle2 className="h-4 w-4 text-success" /> Outcome
            </h4>
            <p className="text-fg/80 text-sm leading-relaxed">
              {analysis.outcome}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
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
      </div>
    </div>
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
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-bg-elevated p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 font-bold font-heading text-base text-fg">
          <FileDigit className="h-4 w-4 text-accent" />
          Personal Notes
        </h3>
        <div className="rounded-lg border border-border bg-bg-subtle p-4">
          <p className="m-0 whitespace-pre-wrap font-mono text-fg text-sm leading-relaxed">
            {notes}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Tab definitions ──────────────────────────────────────────────────────────

export type TabId =
  | "brief"
  | "transcript"
  | "decisions"
  | "tasks"
  | "questions"
  | "points"
  | "notes";

export interface Tab {
  count?: number;
  icon: React.ElementType;
  id: TabId;
  label: string;
}

// ── Tab Content Renderer ──────────────────────────────────────────────────────

export function TabContent({
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
