import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveSessions } from "../../features/meetings/use-active-sessions";
import { useJoinMeeting } from "../../features/meetings/use-join-meeting";
import { AppShell } from "../shared";

type JoinTab = "active" | "manual";

export function JoinMeetingPage() {
  const navigate = useNavigate();
  const activeSessions = useActiveSessions();
  const joinMeeting = useJoinMeeting();

  const [activeTab, setActiveTab] = useState<JoinTab>("active");
  const [manualSessionId, setManualSessionId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hasSessions = useMemo(() => {
    return (activeSessions.data?.length ?? 0) > 0;
  }, [activeSessions.data]);
  const showEmptyState = (() => {
    if (activeSessions.isPending) {
      return false;
    }
    return !hasSessions;
  })();

  async function joinById(sessionId: string) {
    setError(null);
    try {
      const joined = await joinMeeting.mutateAsync({ sessionId });
      navigate(`/meeting/${joined.sessionId}`, {
        state: {
          role: "participant",
          websocketUrl: joined.websocketUrl,
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
    <AppShell title="Join meeting">
      <section className="panel tabs-panel">
        <div className="tabs-row" role="tablist">
          <button
            aria-selected={activeTab === "active"}
            className={activeTab === "active" ? "tab-active" : "tab-button"}
            onClick={() => setActiveTab("active")}
            role="tab"
            type="button"
          >
            Active sessions
          </button>
          <button
            aria-selected={activeTab === "manual"}
            className={activeTab === "manual" ? "tab-active" : "tab-button"}
            onClick={() => setActiveTab("manual")}
            role="tab"
            type="button"
          >
            By session ID
          </button>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        {activeTab === "active" ? (
          <div className="active-list">
            {activeSessions.isPending ? (
              <p>Loading active meetings...</p>
            ) : null}
            {activeSessions.error ? (
              <p className="form-error">{activeSessions.error.message}</p>
            ) : null}
            {showEmptyState ? (
              <p>No active sessions in your organization right now.</p>
            ) : null}

            {(activeSessions.data ?? []).map((session) => (
              <article className="session-row" key={session.sessionId}>
                <div>
                  <h3>{session.title}</h3>
                  <p className="hero-subtitle">
                    {session.clientName}
                    {session.hostName ? ` • Host: ${session.hostName}` : ""}
                    {` • Participants: ${session.participantCount}`}
                  </p>
                </div>
                <button
                  onClick={() => joinById(session.sessionId)}
                  type="button"
                >
                  Join
                </button>
              </article>
            ))}
          </div>
        ) : (
          <form className="auth-form" onSubmit={onManualJoin}>
            <label htmlFor="manual-session-id">Session ID</label>
            <input
              id="manual-session-id"
              onChange={(event) => setManualSessionId(event.target.value)}
              type="text"
              value={manualSessionId}
            />
            <button disabled={joinMeeting.isPending} type="submit">
              {joinMeeting.isPending ? "Joining..." : "Join session"}
            </button>
          </form>
        )}
      </section>
    </AppShell>
  );
}
