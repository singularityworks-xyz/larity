import {
  Activity,
  BookOpen,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  Play,
  Plus,
  Radio,
  ServerCrash,
  Trash2,
  Users,
  Video,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InitialsAvatar } from "../components/avatar";
import { useTheme } from "../components/theme-provider";
import { useAuthSession } from "../features/auth/use-session";
import { useClients } from "../features/clients/use-clients";
import type {
  NextMeeting,
  OpenCommitmentItem,
  RecentActivityItem,
  TodayMeeting,
} from "../features/home/types";
import type { HealthState } from "../features/home/use-health";
import { useHealth } from "../features/home/use-health";
import { useHome } from "../features/home/use-home";
import { useActiveSessions } from "../features/meetings/use-active-sessions";
import { useJoinMeeting } from "../features/meetings/use-join-meeting";
import { useStartSession } from "../features/meetings/use-start-session";
import { useOrgInvites } from "../features/org-invites/use-org-invites";
import { useOrg } from "../features/orgs/use-org";
import { CONTROL_URL } from "../lib/env";
import { cx } from "../lib/ui";

/* ── Utilities ──────────────────────────────────── */

function formatTime(iso: string | null): string {
  if (!iso) {
    return "--:--";
  }
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null) {
    return "--";
  }
  const mins = Math.round(ms / 60_000);
  if (mins < 60) {
    return `${mins}m`;
  }
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function formatDateActivity(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/* ── Animation Variants ─────────────────────────── */

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
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

/* ── Header ─────────────────────────────────────── */

interface HeaderProps {
  canManage: boolean;
  onToggleMemberPanel: () => void;
  openCommitmentsCount: number;
  orgName?: string;
  showMemberPanel: boolean;
  todayMeetingsCount: number;
  userName?: string;
}

function Header({
  userName,
  orgName,
  canManage,
  showMemberPanel,
  onToggleMemberPanel,
  openCommitmentsCount,
  todayMeetingsCount,
}: HeaderProps) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const firstName = userName?.split(" ")[0] ?? "Agent";
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = time.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const dateStr = time.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <motion.header
      className="relative overflow-hidden rounded-xl border-border-subtle/40 border-b px-5 py-5 md:flex-row md:items-end"
      variants={itemVariants}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-bottom bg-cover"
        style={{
          backgroundImage: "url(/images/larity-banner-full.png)",
        }}
      />
      {theme === "dark" && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0c0c10]/90 via-[#0c0c10]/20 to-[#0c0c10]/50" />
      )}

      <div className="relative z-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="font-bold font-heading text-lg text-white leading-none tracking-tight drop-shadow-sm dark:text-white/80">
              {timeStr}
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
            <span className="font-bold font-heading text-lg text-white leading-none tracking-tight drop-shadow-sm dark:text-white/80">
              {dateStr}
            </span>
          </div>
          <h1 className="font-medium text-2xl text-white/90 tracking-tight">
            Ready to focus, <span className="text-white">{firstName}</span>?
          </h1>
          <div className="flex items-center gap-2 text-white/60 text-xs">
            {orgName && (
              <>
                <span className="font-medium">{orgName}</span>
                <span className="h-1 w-1 rounded-full bg-white/40" />
              </>
            )}
            <span>{openCommitmentsCount} open commitments</span>
            <span className="h-1 w-1 rounded-full bg-white/40" />
            <span>{todayMeetingsCount} sessions today</span>
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-3">
            <button
              className="group relative flex items-center gap-2 overflow-hidden rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 backdrop-blur-sm transition-all hover:border-[#a8d62e]/50 hover:shadow-[0_0_20px_rgba(168,214,46,0.15)] active:scale-95"
              onClick={() => navigate("/clients/add")}
              type="button"
            >
              <div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-[#a8d62e]/0 via-[#a8d62e]/5 to-[#a8d62e]/0 transition-transform duration-700 group-hover:translate-x-[100%]" />
              <Plus className="h-4 w-4 text-[#a8d62e]" />
              <span className="font-semibold text-white text-xs">
                New Client
              </span>
            </button>
            <button
              className={cx(
                "group flex items-center gap-2 rounded-xl border px-4 py-2.5 backdrop-blur-sm transition-all active:scale-95",
                showMemberPanel
                  ? "border-white/20 bg-white/15 text-white"
                  : "border-white/10 bg-transparent text-white/70 hover:border-white/20 hover:text-white"
              )}
              onClick={onToggleMemberPanel}
              type="button"
            >
              <Users className="h-4 w-4" />
              <span className="font-semibold text-xs">
                {showMemberPanel ? "Close Panel" : "Invite Team"}
              </span>
            </button>
          </div>
        )}
      </div>
    </motion.header>
  );
}

/* ── Invites ────────────────────────────────────── */

interface InvitePanelProps {
  copyMessage: string;
  inviteError: string;
  invites: ReturnType<typeof useOrgInvites>;
  onCopyInvite: (code: string) => void;
  onCreateInvite: () => void;
  onRevokeInvite: (id: string) => void;
}

function InvitePanel({
  invites,
  copyMessage,
  inviteError,
  onCreateInvite,
  onCopyInvite,
  onRevokeInvite,
}: InvitePanelProps) {
  const hasInvites = (invites.invitesQuery.data?.length ?? 0) > 0;

  return (
    <motion.div
      animate={{ opacity: 1, height: "auto" }}
      className="overflow-hidden"
      exit={{ opacity: 0, height: 0 }}
      initial={{ opacity: 0, height: 0 }}
    >
      <div className="relative mt-3 overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated p-4">
        <div className="pointer-events-none absolute top-0 right-0 rounded-full bg-accent/5 p-32 blur-[100px]" />

        <div className="relative z-10 mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-fg text-sm">
            <Users className="h-4 w-4 text-accent" /> Team Invites
          </h3>
          <button
            className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-fg text-xs transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
            disabled={invites.createInvite.isPending}
            onClick={onCreateInvite}
            type="button"
          >
            {invites.createInvite.isPending ? "Generating..." : "Generate Link"}
          </button>
        </div>

        {copyMessage ? (
          <p className="relative z-10 mb-3 text-success-fg text-xs">
            {copyMessage}
          </p>
        ) : null}
        {inviteError ? (
          <p className="relative z-10 mb-3 text-danger-fg text-xs">
            {inviteError}
          </p>
        ) : null}

        <div className="relative z-10 grid gap-2">
          {hasInvites ? (
            invites.invitesQuery.data?.map((invite) => (
              <div
                className="flex items-center justify-between rounded-lg border border-border-subtle bg-bg-subtle px-3 py-2 transition-colors hover:border-border"
                key={invite.id}
              >
                <div>
                  <div className="font-mono font-semibold text-fg text-xs">
                    {invite.code}
                  </div>
                  <div className="mt-0.5 text-[10px] text-fg-muted">
                    Expires {new Date(invite.expiresAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-bg-overlay hover:text-fg"
                    onClick={() => onCopyInvite(invite.code)}
                    type="button"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded-md p-1.5 text-danger/70 transition-colors hover:bg-danger/10 hover:text-danger"
                    onClick={() => onRevokeInvite(invite.id)}
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-fg-muted text-xs italic">
              No active invite links.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Primary Action Card ────────────────────────── */

function ActionGrid({ canManage }: { canManage: boolean }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"host" | "join">("host");
  const { data: activeSessions } = useActiveSessions();

  const isHost = mode === "host";
  const showHost = canManage && isHost;
  const activeCount = activeSessions?.length ?? 0;

  return (
    <motion.div
      className="overflow-hidden rounded-xl border border-border bg-bg-elevated"
      variants={itemVariants}
    >
      <div className="px-6 pt-6">
        <div className="flex w-full rounded-full border border-border/60 bg-bg-subtle/50 p-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] backdrop-blur-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_2px_4px_rgba(0,0,0,0.2)]">
          {canManage && (
            <button
              className={cx(
                "flex-1 rounded-full py-2 text-center font-semibold text-sm transition-all duration-300",
                isHost
                  ? "bg-gradient-to-b from-accent to-accent/90 text-accent-fg shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.2)] ring-1 ring-black/5 ring-inset dark:ring-white/10"
                  : "text-fg-muted hover:bg-fg/5 hover:text-fg"
              )}
              onClick={() => setMode("host")}
              type="button"
            >
              Host a Session
            </button>
          )}
          <button
            className={cx(
              "flex-1 rounded-full py-2 text-center font-semibold text-sm transition-all duration-300",
              isHost
                ? "text-fg-muted hover:bg-fg/5 hover:text-fg"
                : "bg-gradient-to-b from-info to-info/90 text-white shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.2)] ring-1 ring-black/5 ring-inset dark:ring-white/10"
            )}
            onClick={() => setMode("join")}
            type="button"
          >
            Join a Session
          </button>
        </div>
      </div>

      <div className="px-6 py-6">
        {showHost ? (
          <button
            className="group flex w-full items-end gap-4 text-left transition-all active:scale-[0.99]"
            onClick={() => navigate("/meetings/start")}
            type="button"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent transition-transform duration-300 group-hover:scale-110">
              <Video className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="font-bold font-heading text-fg text-md">
                  Start a Live Meeting
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 font-semibold text-[10px] text-success uppercase tracking-wider ring-1 ring-success/20">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                  Recording Ready
                </span>
              </div>
              <p className="mt-0.5 font-body text-fg-muted text-xs leading-relaxed">
                The agent joins automatically, takes notes, guards you, and
                extracts tasks as you talk.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-b from-accent to-accent/90 px-4 py-2.5 font-semibold text-accent-fg text-xs shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.2)] ring-1 ring-black/5 ring-inset transition-all duration-300 hover:shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] hover:brightness-110 active:scale-95 dark:ring-white/10">
              <Radio className="h-3.5 w-3.5" />
              Go Live
            </div>
          </button>
        ) : (
          <button
            className="group flex w-full items-end gap-4 text-left transition-all active:scale-[0.99]"
            onClick={() => navigate("/meetings/join")}
            type="button"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info transition-transform duration-300 group-hover:scale-110">
              <Users className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="font-bold font-heading text-fg text-md">
                  Join an Active Session
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 font-semibold text-[10px] text-info uppercase tracking-wider ring-1 ring-info/20">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-info" />
                  {activeCount > 0
                    ? `${activeCount} active now`
                    : "No active sessions"}
                </span>
              </div>
              <p className="muted mt-0.5 text-fg-font-body text-xs leading-relaxed">
                Enter a session ID or pick from active sessions to shadow or
                participate.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-b from-info to-info/90 px-4 py-2.5 font-semibold text-white text-xs shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.2)] ring-1 ring-black/5 ring-inset transition-all duration-300 hover:shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] hover:brightness-110 active:scale-95 dark:ring-white/10">
              <Activity className="h-3.5 w-3.5" />
              Active Sessions
            </div>
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ── Next Meeting (Hero) ────────────────────────── */

function NextMeetingHero({
  meeting,
  loading,
}: {
  meeting: NextMeeting | null;
  loading: boolean;
}) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <motion.div
        className="h-32 animate-pulse rounded-[16px] border border-border bg-bg-elevated"
        variants={itemVariants}
      />
    );
  }

  if (!meeting) {
    return (
      <motion.div
        className="flex h-32 flex-col items-center justify-center rounded-[16px] border border-border border-dashed bg-bg-overlay p-4 text-center"
        variants={itemVariants}
      >
        <CalendarClock className="mb-2 h-6 w-6 text-fg-subtle opacity-50" />
        <h3 className="font-semibold text-fg text-xs">No upcoming meetings</h3>
        <p className="mt-0.5 text-[11px] text-fg-muted">
          Take a breather, you're all caught up for now.
        </p>
      </motion.div>
    );
  }

  const startsSoon = meeting.startsInMinutes <= 15;
  const isStartingNow = meeting.startsInMinutes <= 1;
  const isPrepped = meeting.briefStatus === "prepped";
  const attendeesLabel = `${meeting.attendeeCount} Attendee${meeting.attendeeCount === 1 ? "" : "s"}`;

  return (
    <motion.div
      className={cx(
        "relative overflow-hidden rounded-xl border p-4 lg:p-6",
        startsSoon
          ? "border-accent/20 bg-accent/5"
          : "border-border bg-bg-elevated"
      )}
      variants={itemVariants}
    >
      {startsSoon && (
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-accent/20 blur-[80px]" />
      )}

      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <span className="flex items-center gap-1 rounded-md border border-border bg-bg-overlay px-2 py-0.5 font-bold text-[10px] text-fg-muted uppercase tracking-wider">
              <Zap className="h-3 w-3 text-accent" /> Next Up
            </span>
            <span
              className={cx(
                "font-semibold text-xs",
                startsSoon ? "animate-pulse text-accent" : "text-fg-subtle"
              )}
            >
              {isStartingNow
                ? "Starting right now"
                : `In ${meeting.startsInMinutes} minutes`}
            </span>
          </div>

          <h2 className="mb-3 font-bold text-fg text-xl tracking-tight lg:text-2xl">
            {meeting.title}
          </h2>

          <div className="flex items-center gap-3 font-medium text-xs">
            <span className="text-fg-muted">{meeting.client.name}</span>
            <div className="h-1 w-1 rounded-full bg-border-strong" />
            <span className="text-fg-muted">{attendeesLabel}</span>
            <div className="h-1 w-1 rounded-full bg-border-strong" />
            <span
              className={cx(
                "font-semibold",
                isPrepped ? "text-accent" : "text-danger"
              )}
            >
              {isPrepped ? "Prepped" : "Needs Brief"}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          <button
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-accent to-accent/90 px-4 font-semibold text-accent-fg text-xs shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.2)] ring-1 ring-black/5 ring-inset transition-all duration-300 hover:shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] hover:brightness-110 active:scale-95 dark:ring-white/10"
            type="button"
          >
            <Play className="h-3.5 w-3.5 fill-current" /> Start Now
          </button>
          <button
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-bg-elevated px-4 font-semibold text-fg text-xs shadow-sm ring-1 ring-black/5 ring-inset transition-all duration-300 hover:bg-bg-subtle hover:shadow-md hover:brightness-105 active:scale-95 dark:ring-white/5"
            onClick={() => navigate(`/meetings/${meeting.id}/brief`)}
            type="button"
          >
            <BookOpen className="h-3.5 w-3.5 text-accent" />
            Open Brief
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Bento Grid Sections ────────────────────────── */

function TodayMeetingAction({
  m,
  activeSessionInfo,
  startingMeetingId,
  rejoiningMeetingId,
  onStart,
  onRejoin,
}: {
  m: TodayMeeting;
  activeSessionInfo: { sessionId: string } | undefined;
  startingMeetingId: string | null;
  rejoiningMeetingId: string | null;
  onStart: (e: React.MouseEvent, m: TodayMeeting) => void;
  onRejoin: (e: React.MouseEvent, sessionId: string, m: TodayMeeting) => void;
}) {
  const navigate = useNavigate();

  if (m.status === "SCHEDULED") {
    return (
      <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-all duration-300 group-hover:opacity-100">
        <button
          className="flex items-center gap-1 rounded-lg border border-border bg-bg-elevated px-2.5 py-1.5 font-semibold text-fg-subtle text-xs transition-all hover:bg-bg-subtle hover:text-fg active:scale-95"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/meetings/${m.id}/brief`);
          }}
          type="button"
        >
          <BookOpen className="h-3.5 w-3.5 text-accent" />
          Brief
        </button>
        <button
          className="flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1.5 font-semibold text-accent text-xs transition-all hover:bg-accent hover:text-accent-fg active:scale-95 disabled:opacity-50"
          disabled={startingMeetingId === m.id}
          onClick={(e) => onStart(e, m)}
          type="button"
        >
          {startingMeetingId === m.id ? (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" />
          )}
          {startingMeetingId === m.id ? "Starting..." : "Start"}
        </button>
      </div>
    );
  }

  if (m.status === "LIVE" && activeSessionInfo) {
    return (
      <button
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-info/20 bg-info/10 px-3 py-1.5 font-semibold text-info text-xs transition-all duration-300 hover:bg-info hover:text-white active:scale-95 disabled:opacity-50"
        disabled={rejoiningMeetingId === m.id}
        onClick={(e) => onRejoin(e, activeSessionInfo.sessionId, m)}
        type="button"
      >
        {rejoiningMeetingId === m.id ? (
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
        )}
        {rejoiningMeetingId === m.id ? "Rejoining..." : "Rejoin"}
      </button>
    );
  }

  return (
    <span className="shrink-0 font-bold text-[9px] text-fg-subtle uppercase tracking-wider opacity-0 transition-opacity group-hover:opacity-100">
      {m.status}
    </span>
  );
}

function TodayAgenda({
  meetings,
  loading,
}: {
  meetings: TodayMeeting[];
  loading: boolean;
}) {
  const navigate = useNavigate();
  const startSession = useStartSession();
  const joinMeeting = useJoinMeeting();
  const activeSessions = useActiveSessions();
  const [startingMeetingId, setStartingMeetingId] = useState<string | null>(
    null
  );
  const [rejoiningMeetingId, setRejoiningMeetingId] = useState<string | null>(
    null
  );

  const handleStart = async (e: React.MouseEvent, m: TodayMeeting) => {
    e.stopPropagation();
    try {
      setStartingMeetingId(m.id);
      const session = await startSession.mutateAsync({ meetingId: m.id });
      navigate(`/meeting/${session.sessionId}/waiting-room`, {
        state: {
          role: "host",
          websocketUrl: session.websocketUrl,
          clientName: m.client.name,
          meetingTitle: m.title,
          startedAt: Date.now(),
          allowNameCustomization: session.allowNameCustomization,
          meetingId: m.id,
        },
      });
    } catch (err) {
      console.error("Failed to start session from schedule:", err);
      setStartingMeetingId(null);
    }
  };

  const handleRejoin = async (
    e: React.MouseEvent,
    sessionId: string,
    m: TodayMeeting
  ) => {
    e.stopPropagation();
    try {
      setRejoiningMeetingId(m.id);
      const joined = await joinMeeting.mutateAsync({ sessionId });
      navigate(`/meeting/${joined.sessionId}/waiting-room`, {
        state: {
          role: joined.role,
          websocketUrl: joined.websocketUrl,
          clientName: m.client.name,
          meetingTitle: m.title,
          startedAt: Date.now(),
          allowNameCustomization: joined.allowNameCustomization,
          meetingId: m.id,
        },
      });
    } catch (err) {
      console.error("Failed to rejoin session:", err);
      setRejoiningMeetingId(null);
    }
  };

  const isEmpty = !loading && meetings.length === 0;
  return (
    <motion.div
      className="col-span-1 flex flex-col rounded-[16px] border border-border bg-bg-elevated p-4 shadow-sm md:col-span-4 lg:col-span-3"
      variants={itemVariants}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-semibold text-fg text-xs">
          <Calendar className="h-3.5 w-3.5 text-fg-muted" /> Scheduled Today
        </h3>
        {!loading && (
          <span className="rounded-full bg-bg-overlay px-2 py-0.5 font-bold text-[10px] text-fg-muted">
            {meetings.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              className="h-10 animate-pulse rounded-lg bg-bg-subtle"
              key={i}
            />
          ))}
        </div>
      ) : null}
      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center py-6 opacity-60">
          <Calendar className="mb-1.5 h-6 w-6 text-border-strong" />
          <p className="font-medium text-fg-muted text-xs">Clear schedule</p>
        </div>
      ) : null}
      {loading || isEmpty ? null : (
        <div
          className="-mr-2 flex flex-col gap-1.5 overflow-y-auto pr-2"
          style={{ maxHeight: "300px" }}
        >
          {meetings.map((m) => {
            const activeSessionInfo = activeSessions.data?.find(
              (s) => s.meetingId === m.id
            );
            return (
              <div
                className="group flex items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-all hover:border-border hover:bg-bg-subtle hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)]"
                key={m.id}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="w-10 shrink-0 text-right">
                    <div className="font-bold text-[11px] text-fg tabular-nums tracking-tight">
                      {formatTime(m.scheduledAt)}
                    </div>
                  </div>
                  <div className="h-6 w-1 rounded-full bg-border transition-colors group-hover:bg-accent/60" />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-fg text-sm">
                      {m.title}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-fg-muted">
                      {m.client.name}
                    </div>
                  </div>
                </div>

                <TodayMeetingAction
                  activeSessionInfo={activeSessionInfo}
                  m={m}
                  onRejoin={handleRejoin}
                  onStart={handleStart}
                  rejoiningMeetingId={rejoiningMeetingId}
                  startingMeetingId={startingMeetingId}
                />
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function RecentActivityList({
  activity,
  loading,
}: {
  activity: RecentActivityItem[];
  loading: boolean;
}) {
  const navigate = useNavigate();
  const isEmpty = !loading && activity.length === 0;
  return (
    <motion.div
      className="col-span-1 flex flex-col rounded-[16px] border border-border bg-bg-elevated p-4 shadow-sm md:col-span-4 lg:col-span-3"
      variants={itemVariants}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-semibold text-fg text-xs">
          <Clock className="h-3.5 w-3.5 text-fg-muted" /> Recent Activity
        </h3>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              className="h-9 animate-pulse rounded-lg bg-bg-subtle"
              key={i}
            />
          ))}
        </div>
      ) : null}
      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center py-6 opacity-60">
          <Activity className="mb-1.5 h-6 w-6 text-border-strong" />
          <p className="font-medium text-fg-muted text-xs">
            No recent sessions
          </p>
        </div>
      ) : null}
      {loading || isEmpty ? null : (
        <div
          className="-mr-2 flex flex-col gap-2 overflow-y-auto pr-2"
          style={{ maxHeight: "300px" }}
        >
          {activity.map((item) => (
            <button
              className="group flex cursor-pointer flex-col gap-1 rounded-lg border border-transparent px-2 py-1.5 text-left transition-all hover:border-border hover:bg-bg-overlay"
              key={item.id}
              onClick={() => navigate(`/meeting-post/${item.id}`)}
              type="button"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-fg text-xs">
                    {item.title}
                  </div>
                  <div className="mt-0.5 text-[10px] text-fg-muted">
                    {item.client.name} &bull; {formatDateActivity(item.endedAt)}
                  </div>
                </div>
                <div className="shrink-0 rounded border border-border bg-bg px-1.5 py-0.5 font-bold text-[10px] text-fg-subtle shadow-sm">
                  {formatDuration(item.durationMs)}
                </div>
              </div>
              <div className="flex items-center gap-1.5 opacity-60 transition-opacity group-hover:opacity-100">
                {item.tasksCreated > 0 ? (
                  <span className="rounded bg-info/10 px-1.5 font-medium text-[10px] text-info">
                    {item.tasksCreated} tasks
                  </span>
                ) : null}
                {item.commitmentsCaptured > 0 ? (
                  <span className="rounded bg-warning/10 px-1.5 font-medium text-[10px] text-warning">
                    {item.commitmentsCaptured} commits
                  </span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function ActiveCommitments({
  commitments,
  loading,
}: {
  commitments: OpenCommitmentItem[];
  loading: boolean;
}) {
  const isEmpty = !loading && commitments.length === 0;
  return (
    <motion.div
      className="col-span-1 flex flex-col rounded-[16px] border border-border bg-gradient-to-b from-bg-elevated to-bg p-4 shadow-sm md:col-span-4 lg:col-span-3"
      variants={itemVariants}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-semibold text-fg text-xs">
          <CheckCircle2 className="h-3.5 w-3.5 text-warning" /> Open Commitments
        </h3>
        {!loading && commitments.length > 0 && (
          <a
            className="font-semibold text-[10px] text-fg-subtle uppercase tracking-wider transition-colors hover:text-fg"
            href={`${CONTROL_URL}/web/commitments`}
            rel="noreferrer"
            target="_blank"
          >
            View All
          </a>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              className="h-8 animate-pulse rounded-lg bg-bg-subtle"
              key={i}
            />
          ))}
        </div>
      ) : null}
      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center py-4 opacity-60">
          <CheckCircle2 className="mb-1.5 h-6 w-6 text-border-strong" />
          <p className="font-medium text-fg-muted text-xs">All caught up</p>
        </div>
      ) : null}
      {loading || isEmpty ? null : (
        <div className="flex flex-col gap-2">
          {commitments.slice(0, 4).map((c) => (
            <div
              className="flex items-start gap-2 rounded-lg border border-border bg-bg-elevated px-2.5 py-2 shadow-sm"
              key={c.id}
            >
              <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-warning/50" />
              <div className="min-w-0">
                <p className="font-medium text-fg text-xs leading-snug">
                  {c.content}
                </p>
                <p className="mt-1 text-[10px] text-fg-muted">
                  {c.client.name}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function ClientShortcuts() {
  const navigate = useNavigate();
  const { data: clients, isLoading } = useClients();
  if (isLoading || !clients || clients.length === 0) {
    return null;
  }

  const top = [...clients]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    .slice(0, 6);

  return (
    <motion.div
      className="col-span-1 pt-2 md:col-span-8 lg:col-span-9"
      variants={itemVariants}
    >
      <div className="flex flex-wrap gap-2">
        <span className="mr-2 py-2 font-semibold text-fg-muted text-xs">
          Active Clients:
        </span>
        {top.map((c) => (
          <button
            className="flex items-center gap-2 rounded-full border border-border bg-bg-elevated py-1 pr-3 pl-1 transition-all hover:border-accent hover:bg-accent/5"
            key={c.id}
            onClick={() => navigate(`/clients/${c.id}`)}
            type="button"
          >
            <InitialsAvatar
              className="flex h-6 w-6 items-center justify-center rounded-full border border-border-strong bg-bg font-bold text-[9px] text-fg"
              name={c.name}
            />
            <span className="font-semibold text-[11px] text-fg">{c.name}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/* ── Health Strip ───────────────────────────────── */

function StatusDot({
  label,
  state,
}: {
  label: string;
  state: "online" | "offline" | "warning";
}) {
  const colors = {
    online: "bg-success shadow-[0_0_8px_rgba(63,185,80,0.5)]",
    offline: "bg-danger shadow-[0_0_8px_rgba(248,81,73,0.5)]",
    warning: "bg-warning shadow-[0_0_8px_rgba(210,153,34,0.5)]",
  };
  return (
    <div className="flex items-center gap-2">
      <span
        className={cx("inline-block h-2 w-2 rounded-full", colors[state])}
      />
      <span className="font-semibold text-[10px] text-fg-subtle uppercase tracking-widest">
        {label}
      </span>
    </div>
  );
}

function HealthStrip({ health }: { health: HealthState }) {
  const serverState = health.serverOnline ? "online" : "offline";
  const audioState = health.audioDeviceAvailable ? "online" : "warning";
  const audioLabel = health.audioDeviceAvailable
    ? "Audio Ready"
    : "No Audio Device";
  const syncLabel = health.lastSync
    ? `Synced ${health.lastSync.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : "Not Synced";

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 rounded-xl border border-border bg-bg-elevated/50 px-3 py-2 backdrop-blur-sm sm:justify-start">
      <StatusDot label="Server Connected" state={serverState} />
      <span className="h-1 w-1 rounded-full bg-border-strong" />
      <StatusDot label={audioLabel} state={audioState} />
      <span className="h-1 w-1 rounded-full bg-border-strong" />
      <span className="font-semibold text-[10px] text-fg-subtle uppercase tracking-widest">
        {syncLabel}
      </span>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────── */

export function HomePage() {
  const session = useAuthSession();
  const user = session.user;
  const canManage = user?.role === "OWNER" || user?.role === "ADMIN";

  const org = useOrg(user?.orgId);
  const orgName = org.data?.name;
  const { data, isLoading, error } = useHome();
  const invites = useOrgInvites(user);
  const health = useHealth();

  const [showMemberPanel, setShowMemberPanel] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [inviteError, setInviteError] = useState("");

  async function handleCreateInvite() {
    setInviteError("");
    setCopyMessage("");
    try {
      const invite = await invites.createInvite.mutateAsync({ role: "MEMBER" });
      await navigator.clipboard.writeText(invite.code);
      setCopyMessage("Invite code copied to clipboard!");
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : "Could not create invite"
      );
    }
  }

  async function handleCopyInvite(code: string) {
    await navigator.clipboard.writeText(code);
    setCopyMessage("Invite code copied to clipboard!");
  }

  async function handleRevokeInvite(inviteId: string) {
    setInviteError("");
    setCopyMessage("");
    try {
      await invites.revokeInvite.mutateAsync(inviteId);
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : "Could not revoke invite"
      );
    }
  }

  if (error) {
    return (
      <div className="mx-auto mt-20 max-w-xl rounded-2xl border border-danger/20 bg-danger-bg p-6 text-center">
        <ServerCrash className="mx-auto mb-4 h-10 w-10 text-danger" />
        <h2 className="mb-2 font-bold text-danger text-lg">Systems Offline</h2>
        <p className="mb-6 text-danger/80 text-sm">
          {error instanceof Error
            ? error.message
            : "Unknown error connecting to home data"}
        </p>
        <button
          className="rounded-lg bg-danger px-6 py-2 font-semibold text-white hover:brightness-110"
          onClick={() => window.location.reload()}
          type="button"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <motion.div
      animate="show"
      className="mx-auto flex min-h-screen w-full max-w-[1200px] flex-col gap-4 px-4 py-4 sm:px-6 md:px-8 md:py-6"
      initial="hidden"
      variants={containerVariants}
    >
      <Header
        canManage={canManage}
        onToggleMemberPanel={() => setShowMemberPanel(!showMemberPanel)}
        openCommitmentsCount={data?.openCommitments?.length ?? 0}
        orgName={orgName}
        showMemberPanel={showMemberPanel}
        todayMeetingsCount={data?.todayMeetings?.length ?? 0}
        userName={user?.name ?? user?.email}
      />

      <AnimatePresence>
        {showMemberPanel && (
          <InvitePanel
            copyMessage={copyMessage}
            inviteError={inviteError}
            invites={invites}
            onCopyInvite={handleCopyInvite}
            onCreateInvite={handleCreateInvite}
            onRevokeInvite={handleRevokeInvite}
          />
        )}
      </AnimatePresence>

      <ActionGrid canManage={canManage} />

      <NextMeetingHero
        loading={isLoading}
        meeting={data?.nextMeeting ?? null}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-8 lg:grid-cols-9">
        <TodayAgenda loading={isLoading} meetings={data?.todayMeetings ?? []} />
        <RecentActivityList
          activity={data?.recentActivity ?? []}
          loading={isLoading}
        />
        <ActiveCommitments
          commitments={data?.openCommitments ?? []}
          loading={isLoading}
        />

        <ClientShortcuts />
      </div>

      <motion.div className="mt-auto pt-3" variants={itemVariants}>
        <HealthStrip health={health} />
      </motion.div>
    </motion.div>
  );
}
