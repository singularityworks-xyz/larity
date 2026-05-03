import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "../features/auth/use-session";
import { useOrgInvites } from "../features/org-invites/use-org-invites";
import {
  buttonClass,
  cardTextClass,
  cardTitleClass,
  choiceCardClass,
  cx,
  dashboardGridClass,
  eyebrowClass,
  formErrorClass,
  heroSubtitleClass,
  inviteListClass,
  inviteRowClass,
  panelClass,
  successTextClass,
} from "../lib/ui";
import { AppShell } from "./shared";

export function DashboardPage() {
  const navigate = useNavigate();
  const session = useAuthSession();
  const invites = useOrgInvites(session.user);
  const canManageClients =
    session.user?.role === "OWNER" || session.user?.role === "ADMIN";
  const [copyMessage, setCopyMessage] = useState("");
  const [inviteError, setInviteError] = useState("");

  async function handleCreateInvite() {
    setInviteError("");
    setCopyMessage("");
    try {
      const invite = await invites.createInvite.mutateAsync({ role: "MEMBER" });
      await navigator.clipboard.writeText(invite.code);
      setCopyMessage(`Invite code ${invite.code} copied to clipboard`);
    } catch (error) {
      setInviteError(
        error instanceof Error ? error.message : "Could not create invite"
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
    } catch (error) {
      setInviteError(
        error instanceof Error ? error.message : "Could not revoke invite"
      );
    }
  }

  return (
    <AppShell
      subtitle={
        session.user
          ? `Signed in as ${session.user.name ?? session.user.email}`
          : "Meeting controls"
      }
      title="Dashboard"
    >
      <section className={cx(panelClass, dashboardGridClass)}>
        <article className={choiceCardClass}>
          <p className={eyebrowClass}>Meetings</p>
          <h2 className={cardTitleClass}>Start meeting</h2>
          <p className={cardTextClass}>
            Pick a client and launch an ad-hoc live session as host.
          </p>
          <button
            className={cx(buttonClass(), "mt-3")}
            onClick={() => navigate("/meetings/start")}
            type="button"
          >
            Start Meeting
          </button>
        </article>

        <article className={choiceCardClass}>
          <p className={eyebrowClass}>Meetings</p>
          <h2 className={cardTitleClass}>Join meeting</h2>
          <p className={cardTextClass}>
            Join any active meeting from your organization or use a session ID.
          </p>
          <button
            className={cx(buttonClass(), "mt-3")}
            onClick={() => navigate("/meetings/join")}
            type="button"
          >
            Join Meeting
          </button>
        </article>

        {canManageClients ? (
          <article className={choiceCardClass}>
            <p className={eyebrowClass}>Organization</p>
            <h2 className={cardTitleClass}>Add client</h2>
            <p className={cardTextClass}>
              Create a client profile before starting ad-hoc meetings.
            </p>
            <button
              className={cx(buttonClass(), "mt-3")}
              onClick={() => navigate("/clients/add")}
              type="button"
            >
              Add Client
            </button>
          </article>
        ) : null}

        {invites.canManage ? (
          <article className={cx(choiceCardClass, "col-span-full")}>
            <p className={eyebrowClass}>Organization</p>
            <h2 className={cardTitleClass}>Invite teammates</h2>
            <p className={cardTextClass}>
              Create invite codes and share them so members can join your org.
            </p>
            <button
              className={cx(buttonClass(), "mt-3")}
              disabled={invites.createInvite.isPending}
              onClick={() => {
                handleCreateInvite().catch(() => {
                  // handled in function
                });
              }}
              type="button"
            >
              {invites.createInvite.isPending ? "Creating..." : "Create Invite"}
            </button>

            {copyMessage ? (
              <p className={successTextClass}>{copyMessage}</p>
            ) : null}
            {inviteError ? (
              <p className={formErrorClass}>{inviteError}</p>
            ) : null}

            {invites.invitesQuery.isPending ? <p>Loading invites...</p> : null}

            {(invites.invitesQuery.data?.length ?? 0) > 0 ? (
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
                        onClick={() => {
                          handleCopyInvite(invite.code).catch(() => {
                            // clipboard errors are ignored silently
                          });
                        }}
                        type="button"
                      >
                        Copy
                      </button>
                      <button
                        className={buttonClass({
                          size: "sm",
                          variant: "danger",
                        })}
                        onClick={() => {
                          handleRevokeInvite(invite.id).catch(() => {
                            // handled in function
                          });
                        }}
                        type="button"
                      >
                        Revoke
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ) : null}
      </section>
    </AppShell>
  );
}
