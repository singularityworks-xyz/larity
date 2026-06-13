import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { AgendaItem } from "../../features/meetings/types";
import { useMeeting } from "../../features/meetings/use-meeting";
import { useMeetingBrief } from "../../features/meetings/use-meeting-brief";
import { cx } from "../../lib/ui";

export function WaitingRoomPage() {
  const { sessionId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    data: brief,
    isLoading: isBriefLoading,
    isError,
    refetch,
  } = useMeetingBrief(sessionId);
  const { data: meeting } = useMeeting(sessionId);
  const [selectedAgenda, setSelectedAgenda] = useState<AgendaItem[]>([]);

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
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-[#8A8A93]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#4F8AFF] border-t-transparent" />
          <p className="animate-pulse font-mono text-sm">
            Extracting memories...
          </p>
        </div>
      );
    }
    if (isError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-[#8A8A93]">
          <p className="font-mono text-sm">Failed to load meeting context.</p>
          <button
            className="text-[#4F8AFF] text-sm hover:underline"
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
        <div className="rounded-2xl border border-[rgba(255,255,255,0.03)] bg-[rgba(20,20,22,0.4)] p-6 text-center text-[#8A8A93] text-sm">
          No historical context found for this meeting.
        </div>
      );
    }
    return null;
  }

  const briefStatus = renderBriefContent();

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0A0A0B] font-sans text-[#E8E8ED]">
      {/* Background Ambience */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] h-[50%] w-[50%] rounded-full bg-[#4F8AFF] opacity-[0.03] blur-[120px]" />
        <div className="absolute right-[-10%] bottom-[-20%] h-[60%] w-[60%] rounded-full bg-[#FF453A] opacity-[0.02] blur-[150px]" />
      </div>

      <header className="relative z-10 flex w-full items-center justify-between border-[rgba(255,255,255,0.05)] border-b bg-[rgba(10,10,11,0.8)] p-6 backdrop-blur-md">
        <div>
          <h1 className="font-medium text-white text-xl tracking-tight">
            {meeting?.title || "Preparing Session..."}
          </h1>
          <p className="mt-1 font-mono text-[#8A8A93] text-sm">Waiting Room</p>
        </div>
        <button
          className="rounded-full bg-[#4F8AFF] px-6 py-2.5 font-medium text-sm text-white shadow-[0_0_15px_rgba(79,138,255,0.3)] transition-all hover:bg-[#3A75EB] hover:shadow-[0_0_25px_rgba(79,138,255,0.5)] active:scale-95"
          onClick={handleJoin}
          type="button"
        >
          Join Call Now
        </button>
      </header>

      <main className="relative z-10 mx-auto grid h-full w-full max-w-6xl flex-1 grid-cols-1 gap-8 overflow-hidden p-8 lg:grid-cols-12">
        {/* Left Column: Device Preview (Mocked for waiting room brevity) */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <div className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.05)] bg-[#141416]">
            <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="flex flex-col items-center gap-3 text-[#8A8A93]">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(255,255,255,0.03)]">
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="24"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="24"
                >
                  <path d="M23 7l-7 5 7 5V7z" />
                  <rect height="14" rx="2" ry="2" width="15" x="1" y="5" />
                </svg>
              </div>
              <span className="font-medium text-sm">Waiting for Camera...</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-[rgba(255,255,255,0.03)] bg-[rgba(20,20,22,0.4)] p-5">
            <h3 className="font-mono text-[#8A8A93] text-xs uppercase tracking-wider">
              Audio Input
            </h3>
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-[#E8E8ED] shadow-[0_0_8px_rgba(255,255,255,0.6)]" />
              <span className="font-medium text-sm">System Default</span>
            </div>
          </div>
        </div>

        {/* Right Column: The Brief */}
        <div className="scrollbar-thin scrollbar-thumb-[rgba(255,255,255,0.1)] flex h-full flex-col overflow-y-auto pr-2 pb-24 lg:col-span-7">
          <div className="mb-6 flex items-center gap-3">
            <svg
              aria-hidden="true"
              fill="none"
              height="20"
              stroke="#4F8AFF"
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
                <div className="group relative overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.05)] bg-[rgba(20,20,22,0.7)] p-6 shadow-lg backdrop-blur-md">
                  <div className="absolute top-0 left-0 h-full w-1 bg-[#4F8AFF] opacity-80" />
                  <p className="text-[#E8E8ED] text-base leading-relaxed">
                    {brief.tldr}
                  </p>
                </div>

                {/* Landmines & Warnings */}
                {brief.landmines.length > 0 && (
                  <div className="relative overflow-hidden rounded-2xl border border-[rgba(255,69,58,0.15)] bg-[rgba(255,69,58,0.03)] p-6">
                    <h3 className="mb-4 flex items-center gap-2 font-mono text-[#FF453A] text-xs uppercase tracking-wider">
                      <svg
                        aria-hidden="true"
                        fill="none"
                        height="14"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        width="14"
                      >
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" x2="12" y1="9" y2="13" />
                        <line x1="12" x2="12.01" y1="17" y2="17" />
                      </svg>
                      Contextual Landmines
                    </h3>
                    <ul className="flex flex-col gap-3">
                      {brief.landmines.map((lm) => (
                        <li
                          className="flex items-start gap-3 text-[#E8E8ED] text-sm"
                          key={lm.id}
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#FF453A]" />
                          <span className="leading-relaxed">{lm.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Commitments & Suggested Agenda */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* My Commitments */}
                  <div className="flex flex-col gap-3 rounded-2xl border border-[rgba(255,255,255,0.03)] bg-[rgba(20,20,22,0.4)] p-5">
                    <h3 className="font-mono text-[#8A8A93] text-xs uppercase tracking-wider">
                      You Owe
                    </h3>
                    {brief.commitments.mine.length === 0 ? (
                      <p className="text-[#8A8A93] text-sm">
                        No pending tasks.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {brief.commitments.mine.map((c) => {
                          const isSelected = selectedAgenda.some(
                            (i) => i.id === c.id
                          );
                          return (
                            <li key={c.id}>
                              <button
                                className={cx(
                                  "group flex w-full cursor-pointer items-start gap-3 rounded-lg border p-3 text-left text-sm transition-all",
                                  isSelected
                                    ? "border-[#4F8AFF] bg-[rgba(79,138,255,0.1)] text-white"
                                    : "border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] text-[#A1A1A6] hover:border-[rgba(255,255,255,0.1)] hover:text-white"
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
                                    "mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm border transition-colors",
                                    isSelected
                                      ? "border-[#4F8AFF] bg-[#4F8AFF]"
                                      : "border-[rgba(255,255,255,0.2)]"
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
                                <span className="leading-tight">{c.text}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Their Commitments */}
                  <div className="flex flex-col gap-3 rounded-2xl border border-[rgba(255,255,255,0.03)] bg-[rgba(20,20,22,0.4)] p-5">
                    <h3 className="font-mono text-[#8A8A93] text-xs uppercase tracking-wider">
                      They Owe
                    </h3>
                    {brief.commitments.theirs.length === 0 ? (
                      <p className="text-[#8A8A93] text-sm">
                        No pending tasks.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {brief.commitments.theirs.map((c) => {
                          const isSelected = selectedAgenda.some(
                            (i) => i.id === c.id
                          );
                          return (
                            <li key={c.id}>
                              <button
                                className={cx(
                                  "group flex w-full cursor-pointer items-start gap-3 rounded-lg border p-3 text-left text-sm transition-all",
                                  isSelected
                                    ? "border-[#4F8AFF] bg-[rgba(79,138,255,0.1)] text-white"
                                    : "border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] text-[#A1A1A6] hover:border-[rgba(255,255,255,0.1)] hover:text-white"
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
                                    "mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm border transition-colors",
                                    isSelected
                                      ? "border-[#4F8AFF] bg-[#4F8AFF]"
                                      : "border-[rgba(255,255,255,0.2)]"
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
                                <span className="leading-tight">{c.text}</span>
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
      </main>
    </div>
  );
}
