import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileDigit,
  FileText,
  HelpCircle,
  ListTodo,
  MessageSquare,
  RefreshCcw,
  Target,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cx } from "../../../lib/ui";
import { ProcessingBanner } from "./processing-banner";
import { type Tab, TabContent, type TabId } from "./review-tabs";
import { useMeetingInsights } from "./use-meeting-insights";
import {
  isProcessingComplete,
  isProcessingSettled,
  useProcessingStatus,
} from "./use-processing-status";
import { useReprocess } from "./use-reprocess";

export function MeetingPostPage() {
  const { meetingId = "" } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>("brief");
  const queryClient = useQueryClient();

  const { data: insights, isLoading: insightsLoading } =
    useMeetingInsights(meetingId);
  const reprocess = useReprocess(meetingId);

  const { data: status } = useProcessingStatus(meetingId);

  const settled = isProcessingSettled(status);
  const complete = isProcessingComplete(status);
  const hasInvalidatedRef = useRef(false);

  useEffect(() => {
    if (complete && !hasInvalidatedRef.current) {
      hasInvalidatedRef.current = true;
      queryClient.invalidateQueries({
        queryKey: ["meeting-insights", meetingId],
      });
      queryClient.invalidateQueries({
        queryKey: ["meeting-transcript", meetingId],
      });
    }
  }, [complete, meetingId, queryClient]);

  const tabs: Tab[] = useMemo(
    () => [
      { id: "brief", label: "Brief", icon: FileText },
      { id: "transcript", label: "Transcript", icon: MessageSquare },
      { id: "notes", label: "Notes", icon: FileDigit },
      {
        id: "decisions",
        label: "Decisions",
        icon: Target,
        count: insights?.decisions?.length,
      },
      {
        id: "tasks",
        label: "Tasks",
        icon: ListTodo,
        count: insights?.tasks?.length,
      },
      {
        id: "questions",
        label: "Questions",
        icon: HelpCircle,
        count: insights?.openQuestions?.length,
      },
      {
        id: "points",
        label: "Highlights",
        icon: Zap,
        count: insights?.importantPoints?.length,
      },
    ],
    [
      insights?.decisions?.length,
      insights?.tasks?.length,
      insights?.openQuestions?.length,
      insights?.importantPoints?.length,
    ]
  );

  const handleReprocessSuccess = useCallback(() => {
    hasInvalidatedRef.current = false;
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-bg text-fg">
      <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col gap-4 overflow-hidden px-4 pt-12 pb-4 sm:px-6 sm:pt-14 sm:pb-6 md:px-8 md:pt-16 md:pb-6">
        <div className="relative shrink-0 overflow-hidden rounded-2xl border border-border/40 px-6 py-8 md:flex-row md:items-end">
          <div
            className="pointer-events-none absolute inset-0 bg-bottom bg-cover opacity-50 mix-blend-overlay"
            style={{
              backgroundImage: "url(/images/larity-banner-full.png)",
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-bg-base/90 via-bg-base/50 to-bg-base/20" />
          <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 transform-gpu rounded-full bg-accent/20 blur-[120px] will-change-transform" />

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
                  {complete && (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-success/20 px-2.5 py-1 font-bold text-[10px] text-success uppercase tracking-wider shadow-[0_0_15px_rgba(var(--color-success),0.2)] backdrop-blur-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      Analysis Ready
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {settled && (
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
        </div>

        <main className="relative z-10 flex w-full flex-1 flex-col gap-4 overflow-hidden md:flex-row">
          <div className="scrollbar-thin scrollbar-thumb-border-strong flex w-full shrink-0 flex-col gap-2 overflow-y-auto pr-2 pb-4 md:w-64">
            <ProcessingBanner
              onReprocessSuccess={handleReprocessSuccess}
              reprocess={reprocess}
              status={status}
            />

            <div className="flex flex-col gap-1 rounded-xl border border-border bg-bg-elevated p-2 shadow-sm">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    className={cx(
                      "relative flex w-full items-center justify-between rounded-lg px-3 py-2 font-semibold text-sm transition-all duration-200",
                      isActive
                        ? "border border-border bg-bg-subtle text-fg shadow-sm"
                        : "text-fg-muted hover:bg-bg-subtle/50 hover:text-fg"
                    )}
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    type="button"
                  >
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

          <div className="flex flex-1 flex-col overflow-hidden rounded-[16px] border border-border bg-bg-elevated shadow-sm">
            <div className="flex items-center justify-between border-border/40 border-b bg-bg-subtle/50 px-4 py-3 backdrop-blur-sm">
              <h2 className="font-bold font-heading text-base text-fg tracking-tight">
                {tabs.find((t) => t.id === activeTab)?.label}
              </h2>
            </div>
            <div className="scrollbar-thin scrollbar-thumb-border-strong flex-1 overflow-y-auto p-4">
              <div className="fade-in animate-in duration-150" key={activeTab}>
                <TabContent
                  activeTab={activeTab}
                  insights={insights}
                  insightsLoading={insightsLoading}
                  meetingId={meetingId}
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
