import { Radio } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ActiveSession } from "../../features/meetings/types";
import { useActiveSessions } from "../../features/meetings/use-active-sessions";
import { useJoinMeeting } from "../../features/meetings/use-join-meeting";
import {
  activeListClass,
  buttonClass,
  cx,
  eyebrowClass,
  formClass,
  formErrorClass,
  formGroupClass,
  heroTitleClass,
  inputClass,
  labelClass,
  panelClass,
  tabActiveClass,
  tabButtonClass,
  tabsPanelClass,
  tabsRowClass,
} from "../../lib/ui";
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
      className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse bg-success-fg"
      title="Live"
    />
  );
}

function JoinSkeletonRows() {
  return (
    <div className={activeListClass}>
      {[0, 1].map((key) => (
        <div
          className={cx(panelClass, "flex items-start justify-between gap-4")}
          key={`sk-${key}`}
        >
          <div className="grid min-w-0 flex-1 gap-2">
            <div className="h-3 max-w-[120px] rounded-[var(--radius-1)] bg-bg-emphasis" />
            <div className="h-4 max-w-[280px] rounded-[var(--radius-1)] bg-bg-emphasis" />
            <div className="h-3 max-w-[220px] rounded-[var(--radius-1)] bg-bg-emphasis" />
          </div>
          <div className="h-7 w-16 shrink-0 rounded-[var(--radius-1)] bg-bg-emphasis" />
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
      navigate(`/meeting/${joined.sessionId}`, {
        state: {
          role: "participant",
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
      title="Join meeting"
    >
      <section className={tabsPanelClass}>
        <div className={tabsRowClass} role="tablist">
          <button
            aria-selected={activeTab === "active"}
            className={cx(
              tabButtonClass,
              activeTab === "active" && tabActiveClass
            )}
            onClick={() => setActiveTab("active")}
            role="tab"
            type="button"
          >
            Active sessions
          </button>
          <button
            aria-selected={activeTab === "manual"}
            className={cx(
              tabButtonClass,
              activeTab === "manual" && tabActiveClass
            )}
            onClick={() => setActiveTab("manual")}
            role="tab"
            type="button"
          >
            By session ID
          </button>
        </div>

        {error ? <p className={formErrorClass}>{error}</p> : null}

        {activeTab === "active" ? (
          <div className={activeListClass}>
            {activeSessions.isPending ? <JoinSkeletonRows /> : null}
            {activeSessions.error ? (
              <p className={formErrorClass}>{activeSessions.error.message}</p>
            ) : null}
            {showEmptyState ? (
              <div className="grid gap-2 py-6 text-center">
                <Radio
                  aria-hidden
                  className="mx-auto h-6 w-6 text-fg-subtle"
                  strokeWidth={1.5}
                />
                <p className="m-0 font-medium text-fg-muted text-xs">
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
                <article
                  className={cx(
                    panelClass,
                    "flex flex-wrap items-start justify-between gap-4"
                  )}
                  key={session.sessionId}
                >
                  <div className="grid min-w-0 flex-1 gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <LiveHeartbeatDot />
                      <p className={cx(eyebrowClass, "m-0")}>
                        {session.clientName}
                      </p>
                    </div>
                    <h3 className={cx(heroTitleClass, "m-0 text-base")}>
                      {session.title}
                    </h3>
                    <p className="m-0 font-medium text-[11px] text-fg-muted">
                      {session.hostName ? `Host: ${session.hostName}` : "Host"}
                      {" · "}
                      {session.participantCount} participant
                      {session.participantCount === 1 ? "" : "s"}
                      {session.startedAt !== null
                        ? ` · Live ${formatDuration(elapsed)}`
                        : ""}
                    </p>
                  </div>
                  <button
                    className={buttonClass()}
                    disabled={joinMeeting.isPending}
                    onClick={() => joinById(session.sessionId, session)}
                    type="button"
                  >
                    Join
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <form className={formClass} onSubmit={onManualJoin}>
            <div className={formGroupClass}>
              <label className={labelClass} htmlFor="manual-session-id">
                Session ID
              </label>
              <input
                className={inputClass}
                id="manual-session-id"
                onChange={(event) => setManualSessionId(event.target.value)}
                type="text"
                value={manualSessionId}
              />
            </div>
            <button
              className={buttonClass()}
              disabled={joinMeeting.isPending}
              type="submit"
            >
              {joinMeeting.isPending ? "Joining..." : "Join session"}
            </button>
          </form>
        )}
      </section>
    </AppShell>
  );
}
