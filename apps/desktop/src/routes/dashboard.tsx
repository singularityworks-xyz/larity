import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "../features/auth/use-session";
import { useOrgInvites } from "../features/org-invites/use-org-invites";
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
      <section className="panel dashboard-grid">
        <article className="choice-card">
          <p className="eyebrow">Meetings</p>
          <h2>Start meeting</h2>
          <p>Pick a client and launch an ad-hoc live session as host.</p>
          <button onClick={() => navigate("/meetings/start")} type="button">
            Start Meeting
          </button>
        </article>

        <article className="choice-card">
          <p className="eyebrow">Meetings</p>
          <h2>Join meeting</h2>
          <p>
            Join any active meeting from your organization or use a session ID.
          </p>
          <button onClick={() => navigate("/meetings/join")} type="button">
            Join Meeting
          </button>
        </article>

        {canManageClients ? (
          <article className="choice-card">
            <p className="eyebrow">Organization</p>
            <h2>Add client</h2>
            <p>Create a client profile before starting ad-hoc meetings.</p>
            <button onClick={() => navigate("/clients/add")} type="button">
              Add Client
            </button>
          </article>
        ) : null}

        {invites.canManage ? (
          <article className="choice-card invites-card">
            <p className="eyebrow">Organization</p>
            <h2>Invite teammates</h2>
            <p>
              Create invite codes and share them so members can join your org.
            </p>
            <button
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

            {copyMessage ? <p className="success-text">{copyMessage}</p> : null}
            {inviteError ? <p className="form-error">{inviteError}</p> : null}

            {invites.invitesQuery.isPending ? <p>Loading invites...</p> : null}

            {(invites.invitesQuery.data?.length ?? 0) > 0 ? (
              <ul className="invite-list">
                {invites.invitesQuery.data?.map((invite) => (
                  <li className="invite-row" key={invite.id}>
                    <div>
                      <strong>{invite.code}</strong>
                      <p className="hero-subtitle">
                        Expires {new Date(invite.expiresAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="invite-actions">
                      <button
                        className="small-button"
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
                        className="small-button danger-button"
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
