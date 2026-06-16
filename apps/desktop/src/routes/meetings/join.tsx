import { Activity, Radio, Users } from "lucide-react";
import { motion } from "motion/react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ActiveSession } from "../../features/meetings/types";
import { useActiveSessions } from "../../features/meetings/use-active-sessions";
import { useJoinMeeting } from "../../features/meetings/use-join-meeting";
import { cx } from "../../lib/ui";
import { AppShell } from "../shared";

type JoinTab = "active" | "manual";

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function LiveHeartbeatDot() {
  return (
    <span
      aria-hidden
      className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-info"
      title="Live"
    />
  );
}

function JoinSkeletonRows() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1].map((key) => (
        <div
          className="flex items-start justify-between gap-4 rounded-xl border border-border bg-bg-subtle p-4"
          key={`sk-${key}`}
        >
          <div className="grid min-w-0 flex-1 gap-2">
            <div className="h-4 max-w-[120px] animate-pulse rounded-lg bg-bg-emphasis" />
            <div className="h-6 max-w-[280px] animate-pulse rounded-lg bg-bg-emphasis" />
            <div className="h-4 max-w-[220px] animate-pulse rounded-lg bg-bg-emphasis" />
          </div>
          <div className="h-10 w-20 shrink-0 animate-pulse rounded-xl bg-bg-emphasis" />
        </div>
      ))}
    </div>
  );
}

export function JoinMeetingPage() {
  const navigate = useNavigate();
  const activeSessions = useActiveSessions();
  const joinMeeting = useJoinMeeting();

  const [, bumpLiveClock] = useState(0);
  const [activeTab, setActiveTab] = useState<JoinTab>("active");
  const [manualSessionId, setManualSessionId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hasSessions = useMemo(() => {
    return (activeSessions.data?.length ?? 0) > 0;
  }, [activeSessions.data]);

  const showEmptyState = useMemo(() => {
    if (activeSessions.isPending) {
      return false;
    }
    return !hasSessions;
  }, [activeSessions.isPending, hasSessions]);

  useEffect(() => {
    if (activeTab !== "active" || !hasSessions || activeSessions.isPending) {
      return;
    }
    const id = window.setInterval(() => bumpLiveClock((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [activeSessions.isPending, activeTab, hasSessions]);

  async function joinById(sessionId: string, meta?: Partial<ActiveSession>) {
    setError(null);
    try {
      const joined = await joinMeeting.mutateAsync({ sessionId });
      navigate(`/meeting/${joined.sessionId}/waiting-room`, {
        state: {
          role: joined.role,
          websocketUrl: joined.websocketUrl,
          clientName: meta?.clientName ?? "Client",
          meetingTitle: meta?.title ?? "Meeting",
          startedAt:
            meta?.startedAt !== undefined && meta.startedAt !== null
              ? meta.startedAt
              : Date.now(),
          allowNameCustomization:
            joined.allowNameCustomization ??
            meta?.allowNameCustomization ??
            true,
          meetingId: joined.meetingId,
        },
      });
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Join failed";
      setError(message);
    }
  }

  async function onManualJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualSessionId.trim()) {
      setError("Session ID is required");
      return;
    }
    await joinById(manualSessionId.trim());
  }

  return (
    <AppShell
      subtitle="Pick an active session hosted by your org or paste a session ID."
      title="Join a Session"
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="w-full overflow-hidden rounded-[16px] border border-border bg-bg-elevated shadow-sm"
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.3 }}
      >
        <div className="border-border/40 border-b bg-bg-subtle/50 px-6 py-5 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold font-heading text-fg text-lg tracking-tight">
                Join Session
              </h2>
              <p className="font-medium text-fg-muted text-xs">
                Enter an active meeting or use a session ID
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 pt-5">
          <div className="mb-6 flex w-full rounded-full border border-border/60 bg-bg-subtle/50 p-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] backdrop-blur-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_2px_4px_rgba(0,0,0,0.2)]">
            <button
              aria-selected={activeTab === "active"}
              className={cx(
                "flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-center font-semibold text-sm transition-all duration-300",
                activeTab === "active"
                  ? "bg-bg-elevated text-fg shadow-[0_2px_8px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.1)] ring-1 ring-border"
                  : "text-fg-muted hover:bg-fg/5 hover:text-fg"
              )}
              onClick={() => setActiveTab("active")}
              role="tab"
              type="button"
            >
              <Activity className="h-4 w-4" /> Active Sessions
            </button>
            <button
              aria-selected={activeTab === "manual"}
              className={cx(
                "flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-center font-semibold text-sm transition-all duration-300",
                activeTab === "manual"
                  ? "bg-bg-elevated text-fg shadow-[0_2px_8px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.1)] ring-1 ring-border"
                  : "text-fg-muted hover:bg-fg/5 hover:text-fg"
              )}
              onClick={() => setActiveTab("manual")}
              role="tab"
              type="button"
            >
              <Users className="h-4 w-4" /> By Session ID
            </button>
          </div>

          {error ? (
            <div className="mb-6 rounded-lg border border-danger/20 bg-danger/5 p-3 font-medium text-danger text-sm">
              {error}
            </div>
          ) : null}

          {activeTab === "active" ? (
            <div className="flex flex-col gap-3">
              {activeSessions.isPending ? <JoinSkeletonRows /> : null}
              {activeSessions.error ? (
                <div className="rounded-lg border border-danger/20 bg-danger/5 p-3 font-medium text-danger text-sm">
                  {activeSessions.error.message}
                </div>
              ) : null}
              {showEmptyState ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border border-dashed bg-bg-subtle/50 py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-subtle">
                    <Radio className="h-6 w-6 text-fg-subtle opacity-50" />
                  </div>
                  <p className="font-medium text-fg-muted text-sm">
                    No active sessions right now.
                  </p>
                </div>
              ) : null}

              {(activeSessions.data ?? []).map((session) => {
                const elapsed =
                  session.startedAt !== null
                    ? Math.max(0, Date.now() - session.startedAt)
                    : 0;
                return (
                  <motion.article
                    animate={{ opacity: 1, y: 0 }}
                    className="group relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-xl border border-border bg-bg-subtle p-4 transition-all hover:border-border-strong hover:bg-bg-subtle/80"
                    initial={{ opacity: 0, y: 10 }}
                    key={session.sessionId}
                  >
                    <div className="grid min-w-0 flex-1 gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1.5 rounded-full border border-info/20 bg-info/10 px-2 py-0.5 font-bold text-[10px] text-info uppercase tracking-wider">
                          <LiveHeartbeatDot />
                          Live
                        </span>
                        <p className="font-semibold text-[11px] text-fg-subtle uppercase tracking-wider">
                          {session.clientName}
                        </p>
                      </div>
                      <h3 className="mt-1 font-bold font-heading text-fg text-lg">
                        {session.title}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-3 font-medium text-fg-muted text-xs">
                        <span>
                          {session.hostName
                            ? `Host: ${session.hostName}`
                            : "Host"}
                        </span>
                        <div className="h-1 w-1 rounded-full bg-border-strong" />
                        <span>
                          {session.participantCount} participant
                          {session.participantCount === 1 ? "" : "s"}
                        </span>
                        {session.startedAt !== null && (
                          <>
                            <div className="h-1 w-1 rounded-full bg-border-strong" />
                            <span>Live {formatDuration(elapsed)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center">
                      <button
                        className="flex items-center gap-2 rounded-full bg-gradient-to-b from-info to-info/90 px-6 py-2.5 font-semibold text-sm text-white shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.2)] ring-1 ring-black/5 ring-inset transition-all duration-300 hover:shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] hover:brightness-110 active:scale-95 disabled:opacity-50 dark:ring-white/10"
                        disabled={joinMeeting.isPending}
                        onClick={() => joinById(session.sessionId, session)}
                        type="button"
                      >
                        Join
                      </button>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          ) : (
            <form className="flex flex-col gap-6" onSubmit={onManualJoin}>
              <div className="flex flex-col gap-2">
                <label
                  className="font-semibold text-fg text-xs"
                  htmlFor="manual-session-id"
                >
                  Session ID <span className="text-danger">*</span>
                </label>
                <input
                  className="h-11 w-full rounded-full border border-border bg-bg-subtle px-4 font-medium text-fg text-sm transition-colors placeholder:text-fg-subtle hover:border-border-strong focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  id="manual-session-id"
                  onChange={(event) => setManualSessionId(event.target.value)}
                  placeholder="Paste your session ID here"
                  type="text"
                  value={manualSessionId}
                />
              </div>
              <div className="mt-2 flex justify-end border-border/40 border-t pt-5">
                <button
                  className="flex items-center gap-2 rounded-full bg-gradient-to-b from-info to-info/90 px-6 py-2.5 font-semibold text-sm text-white shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.2)] ring-1 ring-black/5 ring-inset transition-all duration-300 hover:shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] hover:brightness-110 active:scale-95 disabled:pointer-events-none disabled:opacity-50 dark:ring-white/10"
                  disabled={joinMeeting.isPending}
                  type="submit"
                >
                  {joinMeeting.isPending ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Joining...
                    </>
                  ) : (
                    "Join Session"
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </AppShell>
  );
}
