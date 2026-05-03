import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HealthStrip } from "../components/home/health-strip";
import { NextMeetingCard } from "../components/home/next-meeting-card";
import { OpenCommitments } from "../components/home/open-commitments";
import { RecentActivity } from "../components/home/recent-activity";
import { TodayPanel } from "../components/home/today-panel";
import { useAuthSession } from "../features/auth/use-session";
import { useHealth } from "../features/home/use-health";
import { useHome } from "../features/home/use-home";
import { useOrgInvites } from "../features/org-invites/use-org-invites";
import { useOrg } from "../features/orgs/use-org";
import {
  buttonClass,
  cx,
  desktopShellClass,
  formErrorClass,
  heroSubtitleClass,
  homeGridClass,
  inviteListClass,
  inviteRowClass,
  panelClass,
  segmentButtonActiveClass,
  segmentButtonClass,
  segmentButtonIdleClass,
  segmentControlClass,
  successTextClass,
} from "../lib/ui";

/* ── Header ─────────────────────────────────────── */

function HomeHeader({
  orgName,
  userName,
  canManage,
  showMemberPanel,
  onToggleMemberPanel,
}: {
  orgName?: string;
  userName?: string;
  canManage: boolean;
  showMemberPanel: boolean;
  onToggleMemberPanel: () => void;
}) {
  const navigate = useNavigate();

  return (
    <header
      className={cx(panelClass, "flex items-center justify-between gap-4")}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 font-semibold text-[13px] text-fg leading-snug">
          {orgName ?? (
            <span className="inline-block h-4 w-24 animate-pulse rounded-sm bg-bg-subtle align-middle" />
          )}
        </span>
        <span className="font-normal text-[13px] text-fg-subtle leading-snug">
          &middot;
        </span>
        <span className="truncate font-medium text-[13px] text-fg-muted leading-snug">
          {userName}
        </span>
      </div>

      {canManage ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            className={cx(buttonClass({ size: "sm", variant: "primary" }))}
            onClick={() => navigate("/clients/add")}
            type="button"
          >
            Add client
          </button>
          <button
            className={cx(buttonClass({ size: "sm", variant: "secondary" }))}
            onClick={onToggleMemberPanel}
            type="button"
          >
            {showMemberPanel ? "Close" : "Add member"}
          </button>
        </div>
      ) : null}
    </header>
  );
}

/* ── Invite panel ───────────────────────────────── */

function InvitePanel({
  invites,
  copyMessage,
  inviteError,
  onCreateInvite,
  onCopyInvite,
  onRevokeInvite,
}: {
  invites: ReturnType<typeof useOrgInvites>;
  copyMessage: string;
  inviteError: string;
  onCreateInvite: () => void;
  onCopyInvite: (code: string) => void;
  onRevokeInvite: (id: string) => void;
}) {
  const hasInvites = (invites.invitesQuery.data?.length ?? 0) > 0;

  return (
    <div className="mt-3 border-border-subtle border-t pt-3">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="font-medium text-[11px] text-fg-muted uppercase leading-none tracking-[0.06em]">
          Invite Teammates
        </p>
        <button
          className={cx(buttonClass({ size: "sm", variant: "primary" }))}
          disabled={invites.createInvite.isPending}
          onClick={onCreateInvite}
          type="button"
        >
          {invites.createInvite.isPending ? "Creating..." : "Create Invite"}
        </button>
      </div>

      {copyMessage ? (
        <p className={cx(successTextClass, "mb-2")}>{copyMessage}</p>
      ) : null}
      {inviteError ? (
        <p className={cx(formErrorClass, "mb-2")}>{inviteError}</p>
      ) : null}

      {invites.invitesQuery.isPending ? (
        <p className="text-[11px] text-fg-muted">Loading invites...</p>
      ) : null}

      {hasInvites ? (
        <ul className={inviteListClass}>
          {invites.invitesQuery.data?.map((invite) => (
            <li className={inviteRowClass} key={invite.id}>
              <div>
                <strong>{invite.code}</strong>
                <p className={heroSubtitleClass}>
                  Expires {new Date(invite.expiresAt).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  className={buttonClass({
                    size: "sm",
                    variant: "secondary",
                  })}
                  onClick={() => onCopyInvite(invite.code)}
                  type="button"
                >
                  Copy
                </button>
                <button
                  className={buttonClass({ size: "sm", variant: "danger" })}
                  onClick={() => onRevokeInvite(invite.id)}
                  type="button"
                >
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {hasInvites || invites.invitesQuery.isPending ? null : (
        <p className="text-[11px] text-fg-subtle">
          No active invites. Create one to add teammates.
        </p>
      )}
    </div>
  );
}

/* ── Toolbar ────────────────────────────────────── */

type ToolbarTab = "start" | "join";

function ToolbarSection({
  canManage,
  showMemberPanel,
  invites,
  copyMessage,
  inviteError,
  onCreateInvite,
  onCopyInvite,
  onRevokeInvite,
}: {
  canManage: boolean;
  showMemberPanel: boolean;
  invites: ReturnType<typeof useOrgInvites>;
  copyMessage: string;
  inviteError: string;
  onCreateInvite: () => void;
  onCopyInvite: (code: string) => void;
  onRevokeInvite: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ToolbarTab>("start");

  return (
    <div className={panelClass}>
      <div className="flex flex-col gap-3">
        <div className={cx(segmentControlClass, "w-auto")}>
          {canManage ? (
            <button
              className={cx(
                segmentButtonClass,
                activeTab === "start"
                  ? segmentButtonActiveClass
                  : segmentButtonIdleClass
              )}
              onClick={() => setActiveTab("start")}
              type="button"
            >
              Start meeting
            </button>
          ) : null}
          <button
            className={cx(
              segmentButtonClass,
              activeTab === "join"
                ? segmentButtonActiveClass
                : segmentButtonIdleClass
            )}
            onClick={() => setActiveTab("join")}
            type="button"
          >
            Join meeting
          </button>
        </div>

        {activeTab === "start" ? (
          <div>
            <p className="text-[11.5px] text-fg-muted leading-relaxed">
              Pick a client and launch an ad-hoc live session as host.
            </p>
            <button
              className={cx(buttonClass(), "mt-2")}
              onClick={() => navigate("/meetings/start")}
              type="button"
            >
              Start Meeting
            </button>
          </div>
        ) : (
          <div>
            <p className="text-[11.5px] text-fg-muted leading-relaxed">
              Join an active session from your organization or enter a session
              ID.
            </p>
            <button
              className={cx(buttonClass(), "mt-2")}
              onClick={() => navigate("/meetings/join")}
              type="button"
            >
              Join Meeting
            </button>
          </div>
        )}
      </div>

      {showMemberPanel ? (
        <InvitePanel
          copyMessage={copyMessage}
          inviteError={inviteError}
          invites={invites}
          onCopyInvite={onCopyInvite}
          onCreateInvite={onCreateInvite}
          onRevokeInvite={onRevokeInvite}
        />
      ) : null}
    </div>
  );
}

/* ── Home Error ─────────────────────────────────── */

function HomeError({ error }: { error: unknown }) {
  return (
    <section className="rounded-[var(--radius-0)] border border-danger-fg bg-danger-bg p-4">
      <p className="font-medium text-[12px] text-danger-fg leading-snug">
        Could not load home data
      </p>
      <p className="mt-1 text-[11px] text-fg-muted leading-relaxed">
        {error instanceof Error ? error.message : "Unknown error"}
      </p>
      <button
        className="mt-2.5 inline-flex h-7 items-center rounded-lg border border-danger-fg bg-transparent px-3 font-medium text-[11.5px] text-danger-fg leading-none transition-all duration-150 ease-out hover:bg-danger-bg active:scale-[0.98]"
        onClick={() => window.location.reload()}
        type="button"
      >
        Retry
      </button>
    </section>
  );
}

/* ── Home Page ──────────────────────────────────── */

export function HomePage() {
  const session = useAuthSession();
  const user = session.user;
  const canManage = user?.role === "OWNER" || user?.role === "ADMIN";

  const org = useOrg(user?.orgId);
  const { data, isLoading, error } = useHome();
  const health = useHealth();
  const invites = useOrgInvites(user);

  const [showMemberPanel, setShowMemberPanel] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [inviteError, setInviteError] = useState("");

  async function handleCreateInvite() {
    setInviteError("");
    setCopyMessage("");
    try {
      const invite = await invites.createInvite.mutateAsync({
        role: "MEMBER",
      });
      await navigator.clipboard.writeText(invite.code);
      setCopyMessage(`Invite code ${invite.code} copied to clipboard`);
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : "Could not create invite"
      );
    }
  }

  async function handleCopyInvite(code: string) {
    await navigator.clipboard.writeText(code);
    setCopyMessage(`Invite code ${code} copied to clipboard`);
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

  return (
    <div className={cx(desktopShellClass, "gap-3")}>
      <HomeHeader
        canManage={canManage}
        onToggleMemberPanel={() => setShowMemberPanel(!showMemberPanel)}
        orgName={org.data?.name}
        showMemberPanel={showMemberPanel}
        userName={user?.name ?? user?.email}
      />

      <ToolbarSection
        canManage={canManage}
        copyMessage={copyMessage}
        inviteError={inviteError}
        invites={invites}
        onCopyInvite={handleCopyInvite}
        onCreateInvite={handleCreateInvite}
        onRevokeInvite={handleRevokeInvite}
        showMemberPanel={showMemberPanel}
      />

      {error ? (
        <HomeError error={error} />
      ) : (
        <>
          <NextMeetingCard
            loading={isLoading}
            meeting={data?.nextMeeting ?? null}
          />

          <div className={homeGridClass}>
            <TodayPanel
              loading={isLoading}
              meetings={data?.todayMeetings ?? []}
            />
            <RecentActivity
              activity={data?.recentActivity ?? []}
              loading={isLoading}
            />
          </div>

          <OpenCommitments
            commitments={data?.openCommitments ?? []}
            loading={isLoading}
          />

          <HealthStrip health={health} />
        </>
      )}
    </div>
  );
}
