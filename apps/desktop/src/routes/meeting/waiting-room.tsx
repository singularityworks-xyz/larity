import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Info,
  Plus,
  Users,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTheme } from "../../components/theme-provider";
import type { AgendaItem } from "../../features/meetings/types";
import { useMeeting } from "../../features/meetings/use-meeting";
import { useMeetingBrief } from "../../features/meetings/use-meeting-brief";
import { useMeetingSessionStatus } from "../../features/meetings/use-meeting-session-status";
import { cx } from "../../lib/ui";

export function WaitingRoomPage() {
  const { sessionId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme } = useTheme();
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
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-fg-subtle">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="animate-pulse font-medium text-sm">
            Synthesizing pre-meeting brief...
          </p>
        </div>
      );
    }
    if (isError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-fg-subtle">
          <AlertTriangle className="h-8 w-8 text-danger/50" />
          <p className="font-medium text-sm">Failed to load meeting context.</p>
          <button
            className="font-semibold text-accent text-sm hover:underline"
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
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border border-dashed bg-bg-subtle/50 py-12 text-center text-fg-subtle">
          <Info className="h-6 w-6 opacity-50" />
          <p className="font-medium text-sm">
            No historical context found for this meeting.
          </p>
        </div>
      );
    }
    return null;
  }

  const briefStatus = renderBriefContent();

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-bg text-fg">
      <header className="relative flex w-full shrink-0 items-center justify-between overflow-hidden border-border/40 border-b px-6 pt-12 pb-4">
        <div
          className="pointer-events-none absolute inset-0 bg-bottom bg-cover opacity-40"
          style={{
            backgroundImage: "url(/images/larity-banner-full.png)",
          }}
        />
        {theme === "dark" && (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-bg/95 via-bg/60 to-bg/95" />
        )}
        {!theme || theme === "light" ? (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-bg/95 via-bg/80 to-bg/95" />
        ) : null}

        <div className="relative z-10 flex items-center gap-4">
          <button
            aria-label="Go back"
            className="group flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-bg-elevated text-fg-subtle transition-all [-webkit-app-region:no-drag] [app-region:no-drag] hover:bg-bg-subtle hover:text-fg active:scale-95"
            onClick={() => navigate(-1)}
            type="button"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-2 w-2 animate-pulse rounded-full bg-info shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
              <p className="font-bold text-[10px] text-info uppercase tracking-wider">
                Waiting Room
              </p>
            </div>
            <h1 className="mt-1 font-bold font-heading text-fg text-xl tracking-tight drop-shadow-sm">
              {meeting?.title || "Preparing Session..."}
            </h1>
          </div>
        </div>
        <button
          className="relative z-10 rounded-xl bg-gradient-to-b from-accent to-accent/90 px-6 py-2.5 font-semibold text-accent-fg text-sm shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.2)] ring-1 ring-black/5 ring-inset transition-all duration-300 hover:shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] hover:brightness-110 active:scale-95 dark:ring-white/10"
          onClick={handleJoin}
          type="button"
        >
          Join Call Now
        </button>
      </header>

      <main className="relative z-10 mx-auto flex h-full w-full max-w-7xl flex-1 flex-col gap-4 overflow-hidden p-4 md:flex-row">
        <div className="flex flex-[2] flex-col overflow-hidden">
          {meeting?.participants && meeting.participants.length > 0 && (
            <div className="mb-4 flex flex-col gap-2 rounded-xl border border-border bg-bg-elevated p-4 shadow-sm">
              <h3 className="flex items-center gap-2 font-semibold text-fg text-xs">
                <Users className="h-4 w-4 text-fg-muted" /> Participants
              </h3>
              <div className="flex flex-wrap gap-2">
                {meeting.participants.map((p) => {
                  const name = p.user?.name || p.externalName || "Unknown";
                  const role = p.role;
                  return (
                    <div
                      className="flex items-center gap-2 rounded-full border border-border bg-bg-subtle py-1 pr-3 pl-1 text-fg text-sm transition-colors hover:border-border-strong hover:bg-bg-subtle/80"
                      key={p.id}
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 font-bold text-[10px] text-accent">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium">{name}</span>
                      {role === "HOST" && (
                        <span className="rounded bg-bg-emphasis px-1.5 py-0.5 font-semibold text-[10px] text-fg-muted">
                          Host
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="scrollbar-thin scrollbar-thumb-border-strong flex h-full flex-col overflow-y-auto pr-2 pb-4">
            <div className="mb-3 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-info" />
              <h2 className="font-bold font-heading text-fg text-lg tracking-tight">
                Pre-Meeting Intelligence
              </h2>
            </div>

            {briefStatus ??
              (brief && (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-4"
                  initial={{ opacity: 0, y: 10 }}
                >
                  <div className="group relative overflow-hidden rounded-xl border border-border bg-bg-elevated p-4 shadow-sm">
                    <div className="absolute top-0 left-0 h-full w-1 bg-info" />
                    <p className="font-medium text-fg text-sm leading-relaxed">
                      {brief.tldr}
                    </p>
                  </div>

                  {brief.landmines.length > 0 && (
                    <div className="relative overflow-hidden rounded-xl border border-warning/20 bg-warning/5 p-4">
                      <h3 className="mb-3 flex items-center gap-2 font-bold text-warning text-xs uppercase tracking-wider">
                        <AlertTriangle className="h-4 w-4" />
                        Contextual Landmines
                      </h3>
                      <ul className="flex flex-col gap-3">
                        {brief.landmines.map((lm) => (
                          <li
                            className="flex items-start gap-3 text-fg text-sm"
                            key={lm.id}
                          >
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                            <span className="font-medium leading-relaxed">
                              {lm.text}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {brief.suggestedAgenda.length > 0 && (
                    <div className="flex flex-col gap-2 rounded-xl border border-border bg-bg-elevated p-4 shadow-sm">
                      <h3 className="font-semibold text-fg text-xs">
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
                                  "group flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-all",
                                  isSelected
                                    ? "border-accent/50 bg-accent/5 text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                                    : "border-border bg-bg-subtle text-fg-muted hover:border-border-strong hover:bg-bg-subtle/80 hover:text-fg"
                                )}
                                onClick={() =>
                                  toggleAgendaItem({ id, text: agendaText })
                                }
                                type="button"
                              >
                                <div
                                  className={cx(
                                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition-colors",
                                    isSelected
                                      ? "border-accent bg-accent"
                                      : "border-border bg-bg"
                                  )}
                                >
                                  {isSelected && (
                                    <CheckCircle2 className="h-3 w-3 text-accent-fg" />
                                  )}
                                </div>
                                <span className="font-medium text-sm leading-snug">
                                  {agendaText}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="flex flex-col gap-2 rounded-xl border border-border bg-bg-elevated p-4 shadow-sm">
                      <h3 className="font-semibold text-fg text-xs">You Owe</h3>
                      {brief.commitments.mine.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-4 opacity-60">
                          <CheckCircle2 className="mb-2 h-5 w-5 text-border-strong" />
                          <p className="font-medium text-fg-muted text-xs">
                            No pending tasks
                          </p>
                        </div>
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
                                    "group flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-all",
                                    isSelected
                                      ? "border-accent/50 bg-accent/5 text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                                      : "border-border bg-bg-subtle text-fg-muted hover:border-border-strong hover:bg-bg-subtle/80 hover:text-fg"
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
                                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition-colors",
                                      isSelected
                                        ? "border-accent bg-accent"
                                        : "border-border bg-bg"
                                    )}
                                  >
                                    {isSelected && (
                                      <CheckCircle2 className="h-3 w-3 text-accent-fg" />
                                    )}
                                  </div>
                                  <span className="font-medium text-sm leading-snug">
                                    {c.text}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 rounded-xl border border-border bg-bg-elevated p-4 shadow-sm">
                      <h3 className="font-semibold text-fg text-xs">
                        They Owe
                      </h3>
                      {brief.commitments.theirs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-4 opacity-60">
                          <CheckCircle2 className="mb-2 h-5 w-5 text-border-strong" />
                          <p className="font-medium text-fg-muted text-xs">
                            No pending tasks
                          </p>
                        </div>
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
                                    "group flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-all",
                                    isSelected
                                      ? "border-accent/50 bg-accent/5 text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                                      : "border-border bg-bg-subtle text-fg-muted hover:border-border-strong hover:bg-bg-subtle/80 hover:text-fg"
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
                                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition-colors",
                                      isSelected
                                        ? "border-accent bg-accent"
                                        : "border-border bg-bg"
                                    )}
                                  >
                                    {isSelected && (
                                      <CheckCircle2 className="h-3 w-3 text-accent-fg" />
                                    )}
                                  </div>
                                  <span className="font-medium text-sm leading-snug">
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
                </motion.div>
              ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden rounded-[16px] border border-border bg-bg-elevated shadow-sm">
          <div className="flex items-center justify-between border-border/40 border-b bg-bg-subtle/50 px-4 py-3 backdrop-blur-sm">
            <h2 className="font-bold font-heading text-base text-fg tracking-tight">
              Meeting Agenda
            </h2>
            <span className="rounded-full bg-accent/10 px-2 py-0.5 font-semibold text-accent text-xs">
              {selectedAgenda.length} items
            </span>
          </div>

          <div className="scrollbar-thin scrollbar-thumb-border-strong flex-1 overflow-y-auto p-4">
            {selectedAgenda.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-subtle">
                  <BookOpen className="h-5 w-5 text-fg-subtle opacity-50" />
                </div>
                <p className="font-medium text-fg-muted text-sm">
                  Select items from the brief
                  <br />
                  or add your own below.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {selectedAgenda.map((item, i) => (
                  <motion.li
                    animate={{ opacity: 1, scale: 1 }}
                    className="group relative flex items-start gap-3 rounded-xl border border-border bg-bg-subtle p-3 shadow-sm transition-all hover:border-border-strong"
                    initial={{ opacity: 0, scale: 0.95 }}
                    key={item.id}
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 font-bold font-mono text-accent text-xs">
                      {i + 1}
                    </div>
                    <span className="flex-1 pt-0.5 font-medium text-fg text-sm leading-snug">
                      {item.text}
                    </span>
                    <button
                      className="absolute top-3 right-3 text-fg-subtle opacity-0 transition-all hover:text-danger hover:opacity-100 group-hover:opacity-60"
                      onClick={() => toggleAgendaItem(item)}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </motion.li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-border/40 border-t bg-bg-subtle/30 p-4">
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
                className="h-10 flex-1 rounded-xl border border-border bg-bg-elevated px-3 font-medium text-fg text-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] transition-colors placeholder:text-fg-subtle hover:border-border-strong focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                id="custom-agenda-input"
                onChange={(e) => setCustomAgendaText(e.target.value)}
                placeholder="Add discussion point..."
                type="text"
                value={customAgendaText}
              />
              <button
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg shadow-[0_2px_8px_rgba(0,0,0,0.15)] ring-1 ring-black/5 ring-inset transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!customAgendaText.trim()}
                type="submit"
              >
                <Plus className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
