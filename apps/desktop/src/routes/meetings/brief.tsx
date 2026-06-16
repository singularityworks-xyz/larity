import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useMeeting } from "../../features/meetings/use-meeting";
import {
  type MeetingBrief,
  useMeetingBrief,
} from "../../features/meetings/use-meeting-brief";
import { ApiError } from "../../lib/api";
import { AppShell } from "../shared";

interface ExpectedRosterProps {
  participants?: Array<{
    id: string;
    role: string;
    externalName?: string | null;
    externalEmail?: string | null;
    user?: { id: string; name: string | null; email: string } | null;
  }>;
}

function ExpectedRoster({ participants }: ExpectedRosterProps) {
  if (!participants || participants.length === 0) {
    return (
      <p className="py-4 text-center text-fg-muted text-xs">
        No participants registered.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {participants.map((p) => {
        const name = p.user?.name || p.externalName || "Unknown User";
        const isHost = p.role === "HOST";
        return (
          <div
            className="flex items-center justify-between rounded-xl border border-border bg-bg-subtle p-3 transition-all hover:border-border-strong"
            key={p.id}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 font-bold text-accent text-xs">
                {name.charAt(0).toUpperCase()}
              </div>
              <span className="font-semibold text-fg text-xs">{name}</span>
            </div>
            {isHost ? (
              <span className="rounded-full bg-bg-emphasis px-2 py-0.5 font-bold text-[9px] text-fg-muted uppercase tracking-wider">
                Host
              </span>
            ) : (
              <span className="rounded-full border border-border-subtle bg-bg-overlay/50 px-2 py-0.5 font-bold text-[9px] text-fg-subtle uppercase tracking-wider">
                Guest
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface BriefDetailsProps {
  brief: MeetingBrief;
}

function BriefDetails({ brief }: BriefDetailsProps) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-6"
      initial={{ opacity: 0, y: 15 }}
      transition={{ duration: 0.3 }}
    >
      {/* TL;DR summary card */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm">
        <div className="absolute top-0 left-0 h-full w-1.5 bg-accent" />
        <h3 className="mb-2 font-bold text-accent text-xs uppercase tracking-wider">
          Executive Summary
        </h3>
        <p className="font-medium text-[15px] text-fg leading-relaxed">
          {brief.tldr}
        </p>
      </div>

      {/* Landmines section */}
      {brief.landmines.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl border border-warning/20 bg-warning/5 p-6">
          <h3 className="mb-4 flex items-center gap-2 font-bold text-warning text-xs uppercase tracking-wider">
            <AlertTriangle className="h-4 w-4" />
            Contextual Landmines / Risk Factors
          </h3>
          <ul className="flex flex-col gap-3">
            {brief.landmines.map((lm) => (
              <li
                className="flex items-start gap-3 text-fg text-sm"
                key={lm.id}
              >
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                <span className="font-medium leading-relaxed">{lm.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Commitments & Action Items */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* You Owe */}
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-elevated p-5 shadow-sm">
          <h3 className="flex items-center gap-2 font-bold text-fg-muted text-xs uppercase tracking-wider">
            <UserCheck className="h-4 w-4 text-accent" />
            Your Action Items
          </h3>
          {brief.commitments.mine.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 opacity-60">
              <CheckCircle2 className="mb-2 h-6 w-6 text-fg-muted" />
              <p className="font-medium text-fg-muted text-xs">
                No pending tasks
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {brief.commitments.mine.map((c) => (
                <li
                  className="flex items-start gap-3 rounded-xl border border-border bg-bg-subtle p-3 text-left transition-colors hover:border-border-strong"
                  key={c.id}
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent/80" />
                  <span className="font-medium text-fg text-xs leading-snug">
                    {c.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* They Owe */}
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-elevated p-5 shadow-sm">
          <h3 className="flex items-center gap-2 font-bold text-fg-muted text-xs uppercase tracking-wider">
            <TrendingUp className="h-4 w-4 text-info" />
            Client Action Items
          </h3>
          {brief.commitments.theirs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 opacity-60">
              <CheckCircle2 className="mb-2 h-6 w-6 text-fg-muted" />
              <p className="font-medium text-fg-muted text-xs">
                No pending tasks
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {brief.commitments.theirs.map((c) => (
                <li
                  className="flex items-start gap-3 rounded-xl border border-border bg-bg-subtle p-3 text-left transition-colors hover:border-border-strong"
                  key={c.id}
                >
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-info/80" />
                  <span className="font-medium text-fg text-xs leading-snug">
                    {c.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Suggested Agenda */}
      {brief.suggestedAgenda.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-elevated p-6 shadow-sm">
          <h3 className="font-bold text-fg-muted text-xs uppercase tracking-wider">
            Suggested Discussion Points
          </h3>
          <ul className="flex flex-col gap-2">
            {brief.suggestedAgenda.map((agendaText, i) => (
              <li
                className="flex items-start gap-3 rounded-xl border border-border bg-bg-subtle p-3 transition-colors hover:border-border-strong"
                key={agendaText}
              >
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 font-bold font-mono text-[10px] text-accent">
                  {i + 1}
                </div>
                <span className="font-medium text-fg text-xs leading-snug">
                  {agendaText}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

export function MeetingBriefPage() {
  const { meetingId = "" } = useParams();
  const { data: meeting, isLoading: isMeetingLoading } = useMeeting(meetingId);
  const {
    data: brief,
    isLoading: isBriefLoading,
    isError,
    error,
    refetch,
  } = useMeetingBrief(meetingId);

  // Auto-poll if generation is in progress (202 status or message indicator)
  const isGenerating =
    isBriefLoading ||
    (isError &&
      error instanceof ApiError &&
      (error.status === 202 ||
        error.message.includes("Brief generation in progress")));

  useEffect(() => {
    if (isGenerating) {
      const interval = setInterval(() => {
        refetch();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isGenerating, refetch]);

  if (isMeetingLoading) {
    return (
      <AppShell
        subtitle="Retrieving meeting details..."
        title="Scheduled Meeting Brief"
      >
        <div className="flex h-[400px] flex-col items-center justify-center gap-4 text-fg-subtle">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="font-medium text-sm">Loading meeting...</p>
        </div>
      </AppShell>
    );
  }

  const clientName = meeting?.client?.name ?? "Client";
  const meetingTitle = meeting?.title ?? "Scheduled Meeting";

  // Render main content area
  const renderContent = () => {
    if (isGenerating) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-bg-elevated py-20 text-center shadow-sm">
          <div className="relative flex h-12 w-12 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/20 opacity-75" />
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-bold text-fg text-sm">Synthesizing Brief...</p>
            <p className="text-fg-muted text-xs">
              Analyzing previous meetings and client context. This takes a few
              seconds.
            </p>
          </div>
        </div>
      );
    }

    if (isError && !brief) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-danger/20 bg-danger/5 py-16 text-center shadow-sm">
          <AlertTriangle className="h-10 w-10 text-danger" />
          <div className="flex flex-col gap-1">
            <p className="font-bold text-fg text-sm">
              Failed to generate brief
            </p>
            <p className="text-fg-muted text-xs">
              There was an error loading the historical context for this
              meeting.
            </p>
          </div>
          <button
            className="rounded-full bg-accent px-4 py-1.5 font-semibold text-accent-fg text-xs transition-all hover:brightness-110 active:scale-95"
            onClick={() => refetch()}
            type="button"
          >
            Try Again
          </button>
        </div>
      );
    }

    if (!brief) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border border-dashed bg-bg-subtle/50 py-16 text-center text-fg-subtle">
          <BookOpen className="h-8 w-8 opacity-40" />
          <div className="flex flex-col gap-1">
            <p className="font-bold text-fg text-sm">No Context Available</p>
            <p className="text-fg-muted text-xs">
              No previous meeting logs or client documents are associated with
              this client.
            </p>
          </div>
        </div>
      );
    }

    return <BriefDetails brief={brief} />;
  };

  return (
    <AppShell subtitle={`Briefing for ${clientName}`} title={meetingTitle}>
      <div className="mx-auto grid w-full max-w-7xl gap-6 pb-12 md:grid-cols-[2.5fr_1fr]">
        {/* Left Column: Brief details */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-5 w-5 text-accent" />
            <h2 className="font-bold font-heading text-fg text-lg tracking-tight">
              Pre-Meeting Intelligence
            </h2>
          </div>
          {renderContent()}
        </div>

        {/* Right Column: Participants list */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2.5">
            <Users className="h-5 w-5 text-accent" />
            <h2 className="font-bold font-heading text-fg text-lg tracking-tight">
              Expected Roster
            </h2>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-elevated p-5 shadow-sm">
            <ExpectedRoster participants={meeting?.participants} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
