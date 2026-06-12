import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { InitialsAvatar } from "../../components/avatar";
import { ClientMembersRoster } from "../../features/clients/components/client-members-roster";
import { useClient } from "../../features/clients/use-client";
import { useUpdateClient } from "../../features/clients/use-update-client";
import { useMeetings } from "../../features/meetings/use-meetings";
import { buttonClass, cx, inputClass } from "../../lib/ui";

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keep as is
export function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { data: client, isLoading: clientLoading } = useClient(clientId ?? "");
  const { data: meetings, isLoading: meetingsLoading } = useMeetings({
    clientId,
  });
  const updateClient = useUpdateClient();

  const [isEditing, setIsEditing] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);

  const [editForm, setEditForm] = useState({
    name: "",
    industry: "",
    description: "",
    status: "ACTIVE",
  });

  useEffect(() => {
    if (client && !isEditing) {
      setEditForm({
        name: client.name,
        industry: client.industry ?? "",
        description: client.description ?? "",
        status: client.status,
      });
    }
  }, [client, isEditing]);

  const handleSave = async () => {
    if (!client) {
      return;
    }
    try {
      await updateClient.mutateAsync({
        id: client.id,
        data: {
          ...editForm,
          status: editForm.status as
            | "ACTIVE"
            | "INACTIVE"
            | "ARCHIVED"
            | undefined,
        },
      });
      setIsEditing(false);
    } catch (e) {
      console.error("Failed to update client", e);
    }
  };

  if (clientLoading) {
    return (
      <div className="flex animate-pulse flex-col gap-6">
        <div className="h-4 w-32 rounded bg-bg-subtle" />
        <div className="h-16 w-full rounded bg-bg-subtle" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="py-8 text-[13px] text-fg-muted">Client not found.</div>
    );
  }

  return (
    <div className="fade-in flex animate-in flex-col gap-8 duration-300">
      <header className="flex flex-col gap-4">
        <nav className="flex items-center font-medium text-[13px] text-fg-muted">
          <Link
            className="no-underline transition-colors hover:text-fg"
            to="/home"
          >
            Home
          </Link>
          <span className="mx-2 text-border-subtle">/</span>
          <Link
            className="no-underline transition-colors hover:text-fg"
            to="/clients"
          >
            Clients
          </Link>
          <span className="mx-2 text-border-subtle">/</span>
          <span className="text-fg">{client.name}</span>
        </nav>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <InitialsAvatar
              className="h-12 w-12 text-[16px]"
              name={client.name}
            />
            <div className="flex flex-col gap-1">
              {isEditing ? (
                <>
                  <input
                    className={cx(
                      inputClass,
                      "h-8 w-[200px] px-2 py-0 font-semibold text-lg"
                    )}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    type="text"
                    value={editForm.name}
                  />
                  <input
                    className={cx(
                      inputClass,
                      "h-6 w-[200px] px-2 py-0 text-[12px]"
                    )}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        industry: e.target.value,
                      }))
                    }
                    placeholder="Industry"
                    type="text"
                    value={editForm.industry}
                  />
                </>
              ) : (
                <>
                  <h1 className="m-0 font-semibold text-fg text-xl leading-none tracking-tight">
                    {client.name}
                  </h1>
                  <span className="text-[13px] text-fg-muted leading-none">
                    {client.industry || "No industry"}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  className={buttonClass({ variant: "ghost", size: "sm" })}
                  onClick={() => {
                    setIsEditing(false);
                    setEditForm({
                      name: client.name,
                      industry: client.industry ?? "",
                      description: client.description ?? "",
                      status: client.status,
                    });
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={buttonClass({ variant: "primary", size: "sm" })}
                  disabled={updateClient.isPending}
                  onClick={handleSave}
                  type="button"
                >
                  {updateClient.isPending ? "Saving..." : "Save"}
                </button>
              </>
            ) : (
              <>
                <button
                  className={buttonClass({ variant: "secondary", size: "sm" })}
                  onClick={() => setIsEditing(true)}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className={buttonClass({ variant: "primary", size: "sm" })}
                  onClick={() =>
                    navigate(`/meetings/start?clientId=${client.id}`)
                  }
                  type="button"
                >
                  Schedule
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-x-8 gap-y-6 border-border border-y py-5 text-[13px] md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <span className="text-fg-muted">Status</span>
          {isEditing ? (
            <select
              className={cx(inputClass, "h-8 w-[200px] px-2 py-0 text-[13px]")}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, status: e.target.value }))
              }
              value={editForm.status}
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          ) : (
            <div className="flex items-center gap-1.5">
              {client.status === "ACTIVE" ? (
                <span
                  aria-label="Active status"
                  className="flex h-1.5 w-1.5 rounded-full bg-success-fg"
                  role="img"
                  title="Active"
                />
              ) : (
                <span
                  aria-label="Inactive status"
                  className="flex h-1.5 w-1.5 rounded-full bg-fg-muted"
                  role="img"
                  title="Inactive"
                />
              )}
              <span className="font-medium text-fg capitalize">
                {client.status.toLowerCase()}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <span className="text-fg-muted">Created</span>
          <span className="font-medium text-fg">
            {new Date(client.createdAt).toLocaleDateString()}
          </span>
        </div>
        <div className="col-span-1 flex flex-col gap-2 border-border-subtle border-t pt-5 md:col-span-2 lg:col-span-4">
          <span className="text-fg-muted">Description</span>
          {isEditing ? (
            <textarea
              className={cx(
                inputClass,
                "min-h-[80px] w-full resize-y px-3 py-2 font-normal text-[13px]"
              )}
              onChange={(e) =>
                setEditForm((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Add a description..."
              value={editForm.description}
            />
          ) : (
            <div className="whitespace-pre-wrap font-medium text-fg leading-relaxed">
              {client.description ? (
                <>
                  {isDescExpanded || client.description.length <= 150
                    ? client.description
                    : `${client.description.slice(0, 150)}...`}
                  {client.description.length > 150 && (
                    <button
                      className="ml-2 cursor-pointer border-0 bg-transparent p-0 font-medium text-[12px] text-accent transition-colors hover:text-fg hover:underline"
                      onClick={() => setIsDescExpanded(!isDescExpanded)}
                      type="button"
                    >
                      {isDescExpanded ? "Show less" : "Read more"}
                    </button>
                  )}
                </>
              ) : (
                "—"
              )}
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="m-0 font-medium text-[14px] text-fg">Meetings</h2>
          <button
            className="cursor-pointer border-0 bg-transparent font-medium text-[12px] text-accent transition-colors hover:text-fg"
            onClick={() => navigate("/home")}
            type="button"
          >
            View All
          </button>
        </div>

        {meetingsLoading && (
          <div className="py-8 text-center text-[13px] text-fg-muted">
            Loading meetings...
          </div>
        )}
        {!meetingsLoading && meetings?.length === 0 && (
          <div className="rounded-[var(--radius-1)] border border-border border-dashed bg-transparent p-6 text-center text-[13px] text-fg-muted">
            No meetings recorded yet
          </div>
        )}
        {!meetingsLoading && meetings && meetings.length > 0 && (
          <div className="flex flex-col overflow-hidden rounded-[var(--radius-1)] border border-border bg-bg-elevated">
            {meetings.map((meeting, i) => (
              <button
                className="group fade-in slide-in-from-bottom-1 flex w-full animate-in items-center justify-between border-0 border-border border-b border-solid bg-transparent p-3.5 text-left transition-colors duration-150 last:border-b-0 hover:bg-bg-subtle"
                key={meeting.id}
                onClick={() =>
                  navigate(
                    meeting.status === "ENDED"
                      ? `/meeting-post/${meeting.id}`
                      : `/meeting/${meeting.id}`
                  )
                }
                style={{
                  animationDelay: `${i * 40}ms`,
                  animationFillMode: "both",
                }}
                type="button"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-border border-solid bg-bg text-fg-muted transition-colors group-hover:text-fg">
                    <svg
                      aria-labelledby={`meetingIcon-${meeting.id}`}
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <title id={`meetingIcon-${meeting.id}`}>Meeting</title>
                      <path
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-[13px] text-fg leading-none">
                      {meeting.title}
                    </span>
                    <span className="text-[12px] text-fg-muted leading-none">
                      {meeting.scheduledAt
                        ? new Date(meeting.scheduledAt).toLocaleString()
                        : "Unscheduled"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className={cx(
                      "rounded-[3px] px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide",
                      meeting.status === "SCHEDULED"
                        ? "border border-border border-solid bg-bg-emphasis text-fg"
                        : "bg-bg-subtle text-fg-muted"
                    )}
                  >
                    {meeting.status}
                  </span>
                  <svg
                    aria-labelledby={`arrowRight-${meeting.id}`}
                    className="h-4 w-4 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <title id={`arrowRight-${meeting.id}`}>Go to meeting</title>
                    <path
                      d="M9 5l7 7-7 7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
      <ClientMembersRoster clientId={client.id} />
    </div>
  );
}
