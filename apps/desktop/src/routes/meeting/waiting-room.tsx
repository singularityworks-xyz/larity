import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { AgendaItem } from "../../features/meetings/types";
import { useMeeting } from "../../features/meetings/use-meeting";
import { useMeetingBrief } from "../../features/meetings/use-meeting-brief";
import { useMeetingSessionStatus } from "../../features/meetings/use-meeting-session-status";
import { cx } from "../../lib/ui";

export function WaitingRoomPage() {
  const { sessionId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: sessionStatus } = useMeetingSessionStatus(sessionId);
  const meetingId = location.state?.meetingId || sessionStatus?.meetingId;

  const {
    data: brief,
    isLoading: isBriefLoading,
    isError,
    refetch,
  } = useMeetingBrief(meetingId);
  const { data: meeting } = useMeeting(meetingId);
  const [selectedAgenda, setSelectedAgenda] = useState<AgendaItem[]>([]);
  const [customAgendaText, setCustomAgendaText] = useState("");

  const handleJoin = () => {
    const state = { ...(location.state || {}), pendingAgenda: selectedAgenda };
    navigate(`/meeting/${sessionId}`, { state });
  };

  const toggleAgendaItem = (item: AgendaItem) => {
    setSelectedAgenda((prev) =>
      prev.some((i) => i.id === item.id)
        ? prev.filter((i) => i.id !== item.id)
        : [...prev, item]
    );
  };

  function renderBriefContent() {
    if (isBriefLoading) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-fg-subtle">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="animate-pulse font-mono text-sm">
            Pre-meeting brief is getting created...
          </p>
        </div>
      );
    }
    if (isError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-fg-subtle">
          <p className="font-mono text-sm">Failed to load meeting context.</p>
          <button
            className="text-accent text-sm hover:underline"
            onClick={() => refetch()}
            type="button"
          >
            Try again
          </button>
        </div>
      );
    }
    if (!brief) {
      return (
        <div className="rounded-2xl border border-border bg-bg-elevated p-6 text-center text-fg-subtle text-sm">
          No historical context found for this meeting.
        </div>
      );
    }
    return null;
  }

  const briefStatus = renderBriefContent();

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-bg pt-9 text-fg">
      {/* Background Ambience */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] h-[50%] w-[50%] rounded-full bg-accent opacity-[0.03] blur-[120px]" />
      </div>

      <header className="relative z-10 flex w-full items-center justify-between border-border border-b bg-bg/80 p-6 backdrop-blur-md">
        <div>
          <h1 className="font-medium text-fg text-xl tracking-tight">
            {meeting?.title || "Preparing Session..."}
          </h1>
          <p className="mt-1 font-mono text-fg-subtle text-sm">Waiting Room</p>
        </div>
        <button
          className="rounded-[var(--radius-button)] bg-accent px-6 py-2.5 font-medium text-accent-fg text-sm shadow-accent/20 shadow-lg transition-all hover:brightness-110 active:scale-95"
          onClick={handleJoin}
          type="button"
        >
          Join Call Now
        </button>
      </header>

      <main className="relative z-10 mx-auto flex h-full w-full max-w-7xl flex-1 flex-row gap-8 overflow-hidden p-8">
        <div className="flex flex-[2] flex-col overflow-hidden">
          {meeting?.participants && meeting.participants.length > 0 && (
            <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-border bg-bg-elevated p-5">
              <h3 className="font-mono text-fg-subtle text-xs uppercase tracking-wider">
                Participants
              </h3>
              <div className="flex flex-wrap gap-2">
                {meeting.participants.map((p) => {
                  const name = p.user?.name || p.externalName || "Unknown";
                  const role = p.role;
                  return (
                    <div
                      className="flex items-center gap-2 rounded-full border border-border-subtle bg-bg-subtle px-3 py-1.5 text-fg text-sm"
                      key={p.id}
                    >
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent font-bold text-[10px] text-accent-fg">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <span>{name}</span>
                      {role === "HOST" && (
                        <span className="rounded bg-bg-emphasis px-1.5 py-0.5 text-[10px] text-fg-muted">
                          Host
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* The Brief */}
          <div className="scrollbar-thin scrollbar-thumb-border-strong flex h-full flex-col overflow-y-auto pr-2 pb-24">
            <div className="mb-6 flex items-center gap-3">
              <svg
                aria-hidden="true"
                className="text-info"
                fill="none"
                height="20"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="20"
              >
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              <h2 className="font-light text-2xl tracking-tight">
                Pre-Meeting Intelligence
              </h2>
            </div>

            {briefStatus ??
              (brief && (
                <div className="fade-in slide-in-from-bottom-2 flex animate-in flex-col gap-6 duration-500">
                  {/* TL;DR */}
                  <div className="group relative overflow-hidden rounded-[var(--radius-panel)] border border-border bg-bg-elevated p-6 shadow-sm">
                    <div className="absolute top-0 left-0 h-full w-1 bg-info" />
                    <p className="text-base text-fg leading-relaxed">
                      {brief.tldr}
                    </p>
                  </div>

                  {/* Landmines & Warnings */}
                  {brief.landmines.length > 0 && (
                    <div className="relative overflow-hidden rounded-[var(--radius-panel)] border border-warning/20 bg-warning-bg p-6">
                      <h3 className="mb-4 flex items-center gap-2 font-mono text-warning text-xs uppercase tracking-wider">
                        <svg
                          aria-label="Warning icon"
                          className="text-warning"
                          fill="none"
                          height="14"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                          width="14"
                        >
                          <title>Flag icon</title>
                          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                          <line x1="4" x2="4" y1="22" y2="15" />
                        </svg>
                        Contextual Landmines
                      </h3>
                      <ul className="flex flex-col gap-3">
                        {brief.landmines.map((lm) => (
                          <li
                            className="flex items-start gap-3 text-fg text-sm"
                            key={lm.id}
                          >
                            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warning" />
                            <span className="leading-relaxed">{lm.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Suggested Agenda */}
                  {brief.suggestedAgenda.length > 0 && (
                    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-elevated p-5">
                      <h3 className="font-mono text-fg-subtle text-xs uppercase tracking-wider">
                        Suggested Agenda
                      </h3>
                      <ul className="flex flex-col gap-2">
                        {brief.suggestedAgenda.map((agendaText, i) => {
                          const id = `agenda-${i}`;
                          const isSelected = selectedAgenda.some(
                            (item) => item.id === id
                          );
                          if (isSelected) {
                            return null;
                          }
                          return (
                            <li key={id}>
                              <button
                                className={cx(
                                  "group flex w-full cursor-pointer items-start gap-2.5 rounded-[var(--radius-button)] border p-2 text-left text-sm transition-all",
                                  isSelected
                                    ? "border-accent bg-accent-muted text-fg"
                                    : "border-border bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg"
                                )}
                                onClick={() =>
                                  toggleAgendaItem({ id, text: agendaText })
                                }
                                type="button"
                              >
                                <div
                                  className={cx(
                                    "mt-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[var(--radius-sharp)] border transition-colors",
                                    isSelected
                                      ? "border-accent bg-accent"
                                      : "border-border"
                                  )}
                                >
                                  {isSelected && (
                                    <svg
                                      aria-label="Checked"
                                      fill="none"
                                      height="10"
                                      role="img"
                                      stroke="var(--accent-fg)"
                                      strokeWidth="3"
                                      viewBox="0 0 24 24"
                                      width="10"
                                    >
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  )}
                                </div>
                                <span className="leading-tight">
                                  {agendaText}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* Commitments & Suggested Agenda */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {/* My Commitments */}
                    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-elevated p-5">
                      <h3 className="font-mono text-text-tertiary text-xs uppercase tracking-wider">
                        You Owe
                      </h3>
                      {brief.commitments.mine.length === 0 ? (
                        <p className="text-[11.5px] text-fg-muted">
                          No pending tasks.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {brief.commitments.mine.map((c) => {
                            const isSelected = selectedAgenda.some(
                              (i) => i.id === c.id
                            );
                            if (isSelected) {
                              return null;
                            }
                            return (
                              <li key={c.id}>
                                <button
                                  className={cx(
                                    "group flex w-full cursor-pointer items-start gap-2.5 rounded-[var(--radius-button)] border p-2 text-left text-sm transition-all",
                                    isSelected
                                      ? "border-accent bg-accent-muted text-fg"
                                      : "border-border bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg"
                                  )}
                                  onClick={() =>
                                    toggleAgendaItem({
                                      id: c.id,
                                      text: `Update on: ${c.text}`,
                                    })
                                  }
                                  type="button"
                                >
                                  <div
                                    className={cx(
                                      "mt-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[var(--radius-sharp)] border transition-colors",
                                      isSelected
                                        ? "border-accent bg-accent"
                                        : "border-border"
                                    )}
                                  >
                                    {isSelected && (
                                      <svg
                                        aria-label="Checked"
                                        fill="none"
                                        height="10"
                                        role="img"
                                        stroke="white"
                                        strokeWidth="3"
                                        viewBox="0 0 24 24"
                                        width="10"
                                      >
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                    )}
                                  </div>
                                  <span className="leading-tight">
                                    {c.text}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    {/* Their Commitments */}
                    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-elevated p-5">
                      <h3 className="font-mono text-text-tertiary text-xs uppercase tracking-wider">
                        They Owe
                      </h3>
                      {brief.commitments.theirs.length === 0 ? (
                        <p className="text-[11.5px] text-fg-muted">
                          No pending tasks.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {brief.commitments.theirs.map((c) => {
                            const isSelected = selectedAgenda.some(
                              (i) => i.id === c.id
                            );
                            if (isSelected) {
                              return null;
                            }
                            return (
                              <li key={c.id}>
                                <button
                                  className={cx(
                                    "group flex w-full cursor-pointer items-start gap-2.5 rounded-[var(--radius-button)] border p-2 text-left text-sm transition-all",
                                    isSelected
                                      ? "border-accent bg-accent-muted text-fg"
                                      : "border-border bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg"
                                  )}
                                  onClick={() =>
                                    toggleAgendaItem({
                                      id: c.id,
                                      text: `Follow up: ${c.text}`,
                                    })
                                  }
                                  type="button"
                                >
                                  <div
                                    className={cx(
                                      "mt-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[var(--radius-sharp)] border transition-colors",
                                      isSelected
                                        ? "border-accent bg-accent"
                                        : "border-border"
                                    )}
                                  >
                                    {isSelected && (
                                      <svg
                                        aria-label="Checked"
                                        fill="none"
                                        height="10"
                                        role="img"
                                        stroke="var(--accent-fg)"
                                        strokeWidth="3"
                                        viewBox="0 0 24 24"
                                        width="10"
                                      >
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                    )}
                                  </div>
                                  <span className="leading-tight">
                                    {c.text}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Right Panel: Meeting Agenda */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-elevated/60 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-border-subtle border-b p-5">
            <h2 className="font-medium text-fg text-lg tracking-tight">
              Meeting Agenda
            </h2>
            <span className="rounded-full bg-accent-subtle px-2.5 py-1 font-mono text-accent text-xs">
              {selectedAgenda.length} items
            </span>
          </div>

          <div className="scrollbar-thin scrollbar-thumb-border-strong flex-1 overflow-y-auto p-5">
            {selectedAgenda.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-fg-subtle">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-subtle">
                  <svg
                    aria-hidden="true"
                    fill="none"
                    height="20"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width="20"
                  >
                    <path d="M12 4v16m-8-8h16" />
                  </svg>
                </div>
                <p className="text-sm">
                  Select items from the brief
                  <br />
                  or add your own below.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {selectedAgenda.map((item, i) => (
                  <li
                    className="group relative flex items-start gap-3 rounded-xl border border-border bg-bg-subtle p-3 transition-colors hover:bg-bg-subtle/80"
                    key={item.id}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle font-mono text-accent text-xs">
                      {i + 1}
                    </div>
                    <span className="flex-1 pt-0.5 text-fg text-sm leading-relaxed">
                      {item.text}
                    </span>
                    <button
                      className="absolute top-3 right-3 text-fg-subtle opacity-0 transition-opacity hover:text-warning-fg group-hover:opacity-100"
                      onClick={() => toggleAgendaItem(item)}
                      type="button"
                    >
                      <svg
                        fill="none"
                        height="14"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        width="14"
                      >
                        <title>Remove icon</title>
                        <line x1="18" x2="6" y1="6" y2="18" />
                        <line x1="6" x2="18" y1="6" y2="18" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-border-subtle border-t p-5">
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (customAgendaText.trim()) {
                  toggleAgendaItem({
                    id: `custom-${Date.now()}`,
                    text: customAgendaText.trim(),
                  });
                  setCustomAgendaText("");
                }
              }}
            >
              <label className="sr-only" htmlFor="custom-agenda-input">
                Add discussion point
              </label>
              <input
                className="flex-1 rounded-lg border border-border bg-bg-subtle px-4 py-2.5 text-fg text-sm placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                id="custom-agenda-input"
                onChange={(e) => setCustomAgendaText(e.target.value)}
                placeholder="Add discussion point..."
                type="text"
                value={customAgendaText}
              />
              <button
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!customAgendaText.trim()}
                type="submit"
              >
                <svg
                  fill="none"
                  height="18"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="18"
                >
                  <title>Add icon</title>
                  <line x1="12" x2="12" y1="5" y2="19" />
                  <line x1="5" x2="19" y1="12" y2="12" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
