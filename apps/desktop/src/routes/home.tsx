import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  Play,
  Plus,
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
import { useOrgInvites } from "../features/org-invites/use-org-invites";
import { useOrg } from "../features/orgs/use-org";
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

/* ── Ticking Clock ──────────────────────────────── */

function TickingClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col">
      <span className="font-medium font-sans text-[2rem] text-fg leading-none tracking-tight shadow-accent/20 drop-shadow-sm md:text-[2.75rem]">
        {time.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })}
      </span>
      <span className="mt-1 font-medium text-accent text-sm uppercase tracking-wide">
        {time.toLocaleDateString([], {
          weekday: "long",
          month: "short",
          day: "numeric",
        })}
      </span>
    </div>
  );
}

/* ── Header ─────────────────────────────────────── */

interface HeaderProps {
  userName?: string;
  orgName?: string;
  canManage: boolean;
  showMemberPanel: boolean;
  onToggleMemberPanel: () => void;
}

function Header({
  userName,
  orgName,
  canManage,
  showMemberPanel,
  onToggleMemberPanel,
}: HeaderProps) {
  const navigate = useNavigate();
  const firstName = userName?.split(" ")[0] ?? "Agent";
  return (
    <motion.header
      className="flex flex-col justify-between gap-3 border-border-subtle/40 border-b pb-4 md:flex-row md:items-end"
      variants={itemVariants}
    >
      <div className="flex flex-col gap-1">
        <TickingClock />
        <h1 className="font-medium text-fg-muted text-lg tracking-tight">
          Ready to focus, <span className="text-fg">{firstName}</span>
          {orgName ? (
            <span className="text-fg-subtle">
              {" "}
              at <span className="text-fg">{orgName}</span>
            </span>
          ) : null}
          ?
        </h1>
      </div>

      {canManage && (
        <div className="flex items-center gap-3">
          <button
            className="group relative flex items-center gap-2 overflow-hidden rounded-xl border border-border bg-bg-elevated px-4 py-2.5 transition-all hover:border-accent/50 hover:shadow-[0_0_20px_var(--accent-muted)] active:scale-95"
            onClick={() => navigate("/clients/add")}
            type="button"
          >
            <div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-accent/0 via-accent/5 to-accent/0 transition-transform duration-700 group-hover:translate-x-[100%]" />
            <Plus className="h-4 w-4 text-accent" />
            <span className="font-semibold text-fg text-xs">New Client</span>
          </button>
          <button
            className={cx(
              "group flex items-center gap-2 rounded-xl border px-4 py-2.5 transition-all active:scale-95",
              showMemberPanel
                ? "border-border-strong bg-bg-subtle text-fg"
                : "border-border bg-transparent text-fg-muted hover:border-border-strong hover:text-fg"
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
    </motion.header>
  );
}

/* ── Invites ────────────────────────────────────── */

interface InvitePanelProps {
  invites: ReturnType<typeof useOrgInvites>;
  copyMessage: string;
  inviteError: string;
  onCreateInvite: () => void;
  onCopyInvite: (code: string) => void;
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

/* ── Primary Action Cards ───────────────────────── */

function ActionGrid({ canManage }: { canManage: boolean }) {
  const navigate = useNavigate();
  return (
    <motion.div
      className="grid grid-cols-1 gap-3 md:grid-cols-2"
      variants={itemVariants}
    >
      {canManage && (
        <button
          className="group relative flex flex-col items-start overflow-hidden rounded-[16px] border border-border bg-gradient-to-br from-bg-elevated to-bg-overlay p-4 text-left transition-all duration-500 hover:border-accent/30 hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] active:scale-[0.98]"
          onClick={() => navigate("/meetings/start")}
          type="button"
        >
          <div className="absolute -inset-px bg-gradient-to-r from-accent/0 via-accent/10 to-accent/0 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100" />
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent transition-transform duration-500 ease-out group-hover:scale-110">
            <Video className="h-5 w-5" />
          </div>
          <h2 className="mb-0.5 font-semibold text-fg text-sm">
            Host a Session
          </h2>
          <p className="max-w-[85%] text-[11px] text-fg-muted leading-relaxed">
            Start a live meeting with a client and let the agent take notes &
            extract tasks automatically.
          </p>
          <div className="absolute right-4 bottom-4 flex h-7 w-7 items-center justify-center rounded-full border border-border text-fg-subtle transition-colors duration-300 group-hover:border-accent group-hover:bg-accent group-hover:text-accent-fg">
            <ArrowRight className="h-4 w-4" />
          </div>
        </button>
      )}
      <button
        className="group relative flex flex-col items-start overflow-hidden rounded-[16px] border border-border bg-gradient-to-br from-bg-elevated to-bg-overlay p-4 text-left transition-all duration-500 hover:border-info/30 hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] active:scale-[0.98]"
        onClick={() => navigate("/meetings/join")}
        type="button"
      >
        <div className="absolute -inset-px bg-gradient-to-r from-info/0 via-info/10 to-info/0 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100" />
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-info/10 text-info transition-transform duration-500 ease-out group-hover:scale-110">
          <Users className="h-5 w-5" />
        </div>
        <h2 className="mb-0.5 font-semibold text-fg text-sm">
          Join an Active Session
        </h2>
        <p className="max-w-[85%] text-[11px] text-fg-muted leading-relaxed">
          Enter a session ID or pick from organization active sessions to shadow
          or participate.
        </p>
        <div className="absolute right-4 bottom-4 flex h-7 w-7 items-center justify-center rounded-full border border-border text-fg-subtle transition-colors duration-300 group-hover:border-info group-hover:bg-info group-hover:text-white">
          <ArrowRight className="h-4 w-4" />
        </div>
      </button>
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
  const attendeesLabel = `${meeting.attendeeCount} Attendee${meeting.attendeeCount !== 1 ? "s" : ""}`;

  return (
    <motion.div
      className={cx(
        "relative overflow-hidden rounded-[16px] border p-4 lg:p-5",
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
          <div className="mb-2 flex items-center gap-2">
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

          <h2 className="mb-1 font-bold text-fg text-xl tracking-tight lg:text-2xl">
            {meeting.title}
          </h2>

          <div className="flex items-center gap-3 font-medium text-xs">
            <div className="flex items-center gap-1.5 text-fg-muted">
              <Users className="h-4 w-4" />
              {meeting.client.name}
            </div>
            <div className="h-1 w-1 rounded-full bg-border-strong" />
            <div className="flex items-center gap-1.5 text-fg-muted">
              <Activity className="h-4 w-4" />
              {attendeesLabel}
            </div>
            <div className="h-1 w-1 rounded-full bg-border-strong" />
            <div
              className={cx(
                "flex items-center gap-1.5",
                isPrepped ? "text-success-fg" : "text-warning-fg"
              )}
            >
              {isPrepped ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              {isPrepped ? "Prepped" : "Needs Brief"}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 font-semibold text-accent-fg text-xs transition-all hover:bg-accent/90 hover:shadow-[0_0_20px_var(--accent-muted)] active:scale-95"
            type="button"
          >
            <Play className="h-3.5 w-3.5 fill-current" /> Start Focus
          </button>
          <button
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-bg-overlay px-4 font-medium text-fg text-xs transition-all hover:bg-bg-subtle active:scale-95"
            type="button"
          >
            Open Brief
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Bento Grid Sections ────────────────────────── */

function TodayAgenda({
  meetings,
  loading,
}: {
  meetings: TodayMeeting[];
  loading: boolean;
}) {
  const isEmpty = !loading && meetings.length === 0;
  return (
    <motion.div
      className="col-span-1 flex flex-col rounded-[16px] border border-border bg-bg-elevated p-4 shadow-sm md:col-span-4 lg:col-span-3"
      variants={itemVariants}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-semibold text-fg text-xs">
          <Calendar className="h-3.5 w-3.5 text-fg-muted" /> Today's Agenda
        </h3>
        {!loading && (
          <span className="rounded-full bg-bg-overlay px-2 py-0.5 font-semibold text-fg-muted text-xs">
            {meetings.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              className="h-8 animate-pulse rounded-lg bg-bg-subtle"
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
          className="-mr-2 flex flex-col gap-2 overflow-y-auto pr-2"
          style={{ maxHeight: "300px" }}
        >
          {meetings.map((m) => (
            <button
              className="group flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition-all hover:border-border hover:bg-bg-overlay"
              key={m.id}
              type="button"
            >
              <div className="w-10 shrink-0 text-right">
                <div className="font-bold text-[11px] text-fg tabular-nums">
                  {formatTime(m.scheduledAt)}
                </div>
              </div>
              <div className="h-5 w-0.5 rounded-full bg-border transition-colors group-hover:bg-accent" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-fg text-sm">
                  {m.title}
                </div>
                <div className="truncate text-[11px] text-fg-muted">
                  {m.client.name}
                </div>
              </div>
            </button>
          ))}
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
            href={`${import.meta.env.VITE_CONTROL_URL ?? "http://localhost:3000"}/web/commitments`}
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
          Quick Access:
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
        orgName={orgName}
        showMemberPanel={showMemberPanel}
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
