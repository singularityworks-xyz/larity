import { ChevronDown, Crown, GitBranch, Pencil, UserCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cx, inputClass } from "../../lib/ui";
import { useClientMembers } from "../clients/use-client-members";
import { useCreateClientMember } from "../clients/use-create-client-member";
import { useConfirmSpeakerMapping } from "../meetings/use-confirm-speaker-mapping";
import { IDENTIFICATION_CONFIDENCE_THRESHOLD } from "./participant-avatars";
import type { LiveCommitment, LiveParticipant } from "./types";

const WHITESPACE_SPLIT = /\s+/;

function CollapsibleSection({
  title,
  badge,
  children,
  defaultOpen = true,
}: {
  title: string;
  badge?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = `sidebar-section-${title.toLowerCase().replace(/\s+/g, "-")}-content`;

  return (
    <section className="border-border-subtle border-t first:border-t-0">
      <button
        aria-controls={contentId}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors duration-100 hover:bg-bg-subtle/40"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-[10px] text-fg-subtle uppercase tracking-[0.07em]">
            {title}
          </span>
          {badge !== undefined && badge > 0 && (
            <span className="inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-[2px] bg-bg-emphasis px-1 font-mono text-[9px] text-fg-muted tabular-nums">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown
          className={cx(
            "h-3 w-3 shrink-0 text-fg-subtle/50 transition-transform duration-150 ease-out",
            !open && "-rotate-90"
          )}
          strokeWidth={1.5}
        />
      </button>
      {open ? (
        <div className="px-3 pb-3" id={contentId}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

function CommitmentStatusBadge({
  status,
}: {
  status: LiveCommitment["status"];
}) {
  switch (status) {
    case "CONFIRMED":
      return (
        <span className="inline-flex h-[16px] items-center rounded-[3px] border border-success-fg/25 bg-success-bg px-1.5 font-medium text-[9px] text-success-fg">
          CONFIRMED
        </span>
      );
    case "TENTATIVE":
      return (
        <span className="inline-flex h-[16px] items-center rounded-[3px] border border-warning-fg/25 bg-warning-bg px-1.5 font-medium text-[9px] text-warning-fg">
          TENTATIVE
        </span>
      );
    case "CONTRADICTED":
      return (
        <span className="inline-flex h-[16px] items-center rounded-[3px] border border-danger-fg/30 bg-danger-bg px-1.5 font-medium text-[9px] text-danger-fg">
          CONTRADICTED
        </span>
      );
    default:
      return (
        <span className="inline-flex h-[16px] items-center rounded-[3px] border border-border bg-bg-subtle px-1.5 font-medium text-[9px] text-fg-subtle line-through">
          SUPERSEDED
        </span>
      );
  }
}

function formatEvidenceClock(meetingStartMs: number, ts: number): string {
  const delta = Math.max(0, ts - meetingStartMs);
  const totalSec = Math.floor(delta / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface MeetingSidebarProps {
  clientId?: string;
  sessionId: string;
  participants: LiveParticipant[];
  commitments: LiveCommitment[];
  meetingStartedAtMs: number;
  onEvidenceClick: (utteranceId: string) => void;
  onChangeRole?: (speakerId: string, role: "TEAM" | "EXTERNAL") => void;
  pendingAgenda?: Array<{ id: string; text: string }>;
}

export function MeetingSidebar({
  clientId,
  sessionId,
  participants,
  commitments,
  meetingStartedAtMs,
  onEvidenceClick,
  onChangeRole,
  pendingAgenda = [],
}: MeetingSidebarProps) {
  const storageKey = `larity-meeting-notes-${sessionId}`;
  const [notes, setNotes] = useState("");
  const [notesSavedVersion, setNotesSavedVersion] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: members = [] } = useClientMembers(clientId ?? "");
  const createMember = useCreateClientMember();
  const confirmMapping = useConfirmSpeakerMapping();

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setNotes(stored);
        setNotesSavedVersion(stored);
      }
    } catch {
      // localStorage may be unavailable
    }
  }, [storageKey]);

  const dirty = notes !== notesSavedVersion;

  const sortedCommitments = useMemo(
    () => [...commitments].sort((a, b) => b.timestamp - a.timestamp),
    [commitments]
  );

  const team = participants.filter((p) => p.type === "TEAM");
  const external = participants.filter((p) => p.type === "EXTERNAL");

  const saveNotes = useCallback(() => {
    try {
      localStorage.setItem(storageKey, notes);
      setNotesSavedVersion(notes);
    } catch {
      // ignore
    }
  }, [notes, storageKey]);

  function renderParticipantRow(p: LiveParticipant) {
    const display = overrides[p.id] ?? p.name;
    const editing = editingId === p.id;
    const initials = display
      .split(WHITESPACE_SPLIT)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const isUnidentified =
      p.type === "EXTERNAL" &&
      (p.confidence ?? 0) < IDENTIFICATION_CONFIDENCE_THRESHOLD;

    return (
      <div
        className="group flex items-start gap-2 py-1.5 first:pt-0"
        key={p.id}
      >
        <div
          className={cx(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] border font-semibold text-[10px]",
            p.isSelf
              ? "border-accent/30 bg-accent-subtle text-accent"
              : "border-border bg-bg-subtle text-fg"
          )}
        >
          {initials || "?"}
        </div>

        <div className="min-w-0 flex-1">
          {editing && p.type === "EXTERNAL" && clientId && (
            <IdentifyExternalSpeakerDropdown
              clientId={clientId}
              confirmMapping={confirmMapping}
              createMember={createMember}
              deepgramIndex={p.id}
              members={members}
              onComplete={() => setEditingId(null)}
              onLocalOverride={(name) =>
                setOverrides((prev) => ({ ...prev, [p.id]: name }))
              }
              sessionId={sessionId}
            />
          )}
          {editing && !(p.type === "EXTERNAL" && clientId) && (
            <input
              aria-label={`Rename ${p.name}`}
              autoFocus
              className={inputClass}
              onBlur={() => setEditingId(null)}
              onChange={(event) =>
                setOverrides((previous) => ({
                  ...previous,
                  [p.id]: event.target.value,
                }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setEditingId(null);
                }
              }}
              value={display}
            />
          )}
          {!editing && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="truncate font-medium text-[12px] text-fg">
                {display}
              </span>
              {p.isHost ? (
                <span className="inline-flex items-center gap-0.5 rounded-[2px] bg-accent-subtle/60 px-1 py-px font-medium text-[8px] text-accent leading-none">
                  <Crown aria-hidden className="h-2 w-2" strokeWidth={2} />
                  Host
                </span>
              ) : null}
              {p.isSelf ? (
                <span className="rounded-[2px] bg-accent-subtle px-1 py-px font-medium text-[8px] text-accent leading-none">
                  You
                </span>
              ) : null}
            </div>
          )}

          <div className="flex items-center gap-1.5 pt-0.5">
            <select
              aria-label={`Change role for ${display}`}
              className={cx(
                "bg-transparent font-medium text-[9px] text-fg-subtle uppercase tracking-[0.05em]",
                "cursor-pointer border-none p-0 hover:text-fg focus:border-none focus:outline-none focus:ring-0"
              )}
              onChange={(e) => {
                const nextRole = e.target.value as "TEAM" | "EXTERNAL";
                onChangeRole?.(p.id, nextRole);
              }}
              value={p.type}
            >
              <option
                className="bg-bg-elevated font-sans text-fg uppercase"
                value="TEAM"
              >
                Team
              </option>
              <option
                className="bg-bg-elevated font-sans text-fg uppercase"
                value="EXTERNAL"
              >
                External
              </option>
            </select>
            <span aria-hidden className="h-2.5 w-px bg-border-subtle" />

            <span
              aria-label={p.isConnected ? "Connected" : "Disconnected"}
              className={cx(
                "ml-auto inline-block h-[5px] w-[5px] shrink-0 rounded-[1px]",
                p.isConnected ? "bg-success-fg" : "bg-fg-subtle/30"
              )}
              role="img"
            />
          </div>

          {isUnidentified && !editing && (
            <button
              className={cx(
                "mt-1.5 inline-flex h-5 items-center gap-1 rounded-[var(--radius-button)] px-2",
                "border border-border bg-bg-elevated",
                "font-medium text-[10px] text-fg-subtle transition-colors duration-100 hover:border-border-strong hover:bg-bg-overlay hover:text-fg"
              )}
              onClick={() => setEditingId(p.id)}
              type="button"
            >
              <UserCheck size={10} strokeWidth={1.5} />
              Identify speaker
            </button>
          )}
        </div>

        <button
          aria-label={`Edit name for ${display}`}
          className="shrink-0 opacity-0 transition-opacity duration-100 group-hover:opacity-100"
          onClick={() => setEditingId(p.id)}
          type="button"
        >
          <Pencil className="h-3 w-3 text-fg-subtle" strokeWidth={1.5} />
        </button>
      </div>
    );
  }

  return (
    <aside
      className={cx(
        "flex w-[300px] shrink-0 flex-col overflow-y-auto",
        "border-border border-l",
        "bg-[linear-gradient(180deg,var(--bg-elevated)_0%,var(--bg)_100%)]"
      )}
    >
      <CollapsibleSection badge={participants.length} title="Participants">
        <div className="space-y-0">
          <p className="mb-1.5 font-medium text-[9px] text-fg-subtle/60 uppercase tracking-[0.07em]">
            Team · {team.length}
          </p>
          {team.length === 0 ? (
            <p className="text-[11px] text-fg-subtle">No team speakers yet.</p>
          ) : (
            team.map(renderParticipantRow)
          )}
        </div>
        <div className="mt-3 space-y-0 border-border-subtle border-t pt-3">
          <p className="mb-1.5 font-medium text-[9px] text-fg-subtle/60 uppercase tracking-[0.07em]">
            External · {external.length}
          </p>
          {external.length === 0 ? (
            <p className="text-[11px] text-fg-subtle">
              No external speakers yet.
            </p>
          ) : (
            external.map(renderParticipantRow)
          )}
          {clientId && (
            <div className="mt-2 flex justify-center border-border-subtle/50 border-t pt-2">
              <button
                className="flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-[10px] text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg"
                onClick={() => {
                  window.open(
                    `/clients/${clientId}`,
                    "_blank",
                    "width=800,height=600"
                  );
                }}
                type="button"
              >
                Manage Client Members
              </button>
            </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        badge={sortedCommitments.length}
        title="Commitment ledger"
      >
        {sortedCommitments.length === 0 ? (
          <p className="m-0 text-[11px] text-fg-subtle">
            No commitments classified yet.
          </p>
        ) : (
          <ul className="m-0 grid list-none gap-0 p-0">
            {sortedCommitments.map((c) => (
              <li
                className="commitment-row-enter grid gap-1.5 border-border-subtle border-b py-2.5 last:border-b-0"
                key={c.id}
              >
                <div className="flex items-center gap-1.5">
                  <CommitmentStatusBadge status={c.status} />
                  <button
                    className="font-mono text-[10px] text-accent hover:underline"
                    onClick={() => onEvidenceClick(c.sourceUtteranceId)}
                    title="Jump to transcript"
                    type="button"
                  >
                    [{formatEvidenceClock(meetingStartedAtMs, c.timestamp)}]
                  </button>
                  {c.speakerName && (
                    <>
                      <span className="text-[9px] text-fg-subtle/40">·</span>
                      <span className="font-medium text-[10px] text-fg-muted">
                        {c.speakerName}
                      </span>
                    </>
                  )}
                </div>
                <p className="m-0 text-[12px] text-fg leading-snug">{c.text}</p>
                {c.status === "CONTRADICTED" &&
                  c.contradictedAtTimestamp != null && (
                    <p className="m-0 flex items-start gap-1 text-[11px] text-danger-fg/80">
                      <GitBranch
                        className="mt-0.5 h-3 w-3 shrink-0"
                        strokeWidth={1.5}
                      />
                      Contradicted at [{" "}
                      {formatEvidenceClock(
                        meetingStartedAtMs,
                        c.contradictedAtTimestamp
                      )}
                      ]
                    </p>
                  )}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      {pendingAgenda.length > 0 && (
        <CollapsibleSection
          badge={pendingAgenda.length}
          defaultOpen={true}
          title="Agenda"
        >
          <ul className="flex flex-col gap-2">
            {pendingAgenda.map((item, i) => (
              <li
                className="flex items-start gap-2.5 rounded-[var(--radius-panel)] border border-border bg-bg-elevated p-2 shadow-sm"
                key={item.id}
              >
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--radius-sharp)] border border-border bg-bg font-mono text-[9px] text-fg-muted">
                  {i + 1}
                </div>
                <span className="pt-[1px] text-[12px] text-fg leading-snug">
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      <CollapsibleSection defaultOpen={false} title="Notes">
        <div className="space-y-2">
          <label
            className="font-medium text-[9px] text-fg-subtle/60 uppercase tracking-[0.07em]"
            htmlFor={`notes-${sessionId}`}
          >
            Personal · stays on-device
          </label>

          <textarea
            className={cx(
              "w-full resize-none rounded-[5px] border border-border bg-bg px-2.5 py-2",
              "font-mono text-[12px] text-fg leading-relaxed placeholder:text-fg-subtle/40",
              "transition-colors duration-100",
              "min-h-[100px] focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
            )}
            id={`notes-${sessionId}`}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Capture while the meeting runs…"
            value={notes}
          />

          <div className="flex items-center justify-between">
            <span
              className={cx(
                "text-[10px] transition-colors duration-300",
                dirty ? "text-fg-subtle" : "text-fg-subtle/40"
              )}
            >
              {dirty ? "Unsaved changes" : "Saved locally"}
            </span>
            {dirty && (
              <button
                className="font-medium text-[10px] text-accent hover:underline"
                onClick={saveNotes}
                type="button"
              >
                Save now
              </button>
            )}
          </div>
        </div>
      </CollapsibleSection>
    </aside>
  );
}

function IdentifyExternalSpeakerDropdown({
  clientId,
  sessionId,
  deepgramIndex,
  members,
  createMember,
  confirmMapping,
  onComplete,
  onLocalOverride,
}: {
  clientId: string;
  sessionId: string;
  deepgramIndex: string;
  members: { id: string; name: string }[];
  // biome-ignore lint/suspicious/noExplicitAny: generic bypass
  createMember: { mutateAsync: (data: any) => Promise<{ id: string }> };
  // biome-ignore lint/suspicious/noExplicitAny: generic bypass
  confirmMapping: { mutateAsync: (data: any) => Promise<unknown> };
  onComplete: () => void;
  onLocalOverride: (name: string) => void;
}) {
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newName, setNewName] = useState("");

  const handleSelect = async (memberId: string) => {
    if (memberId === "new") {
      setIsCreatingNew(true);
      return;
    }
    const member = members.find((m) => m.id === memberId);
    if (!member) {
      return;
    }

    try {
      await confirmMapping.mutateAsync({
        meetingId: sessionId,
        deepgramIndex,
        clientMemberId: memberId,
      });

      onLocalOverride(member.name);
      onComplete();
    } catch (err) {
      console.error("Failed to map speaker:", err);
    }
  };

  const handleCreate = async (e: React.KeyboardEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      return;
    }

    try {
      const newMember = await createMember.mutateAsync({
        clientId,
        name: newName.trim(),
        role: "CONTACT",
      });

      await confirmMapping.mutateAsync({
        meetingId: sessionId,
        deepgramIndex,
        clientMemberId: newMember.id,
      });

      onLocalOverride(newName.trim());
      onComplete();
    } catch (err) {
      console.error("Failed to create client member or map speaker:", err);
    }
  };

  if (isCreatingNew) {
    return (
      <input
        autoFocus
        className={inputClass}
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleCreate(e);
          }
          if (e.key === "Escape") {
            onComplete();
          }
        }}
        placeholder="Enter new name..."
        value={newName}
      />
    );
  }

  return (
    <select
      autoFocus
      className={cx(inputClass, "cursor-pointer")}
      onBlur={() => {
        // Only trigger complete on blur if we haven't selected "new"
        if (!isCreatingNew) {
          onComplete();
        }
      }}
      onChange={(e) => handleSelect(e.target.value)}
      value=""
    >
      <option disabled value="">
        Select identity...
      </option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
      <option value="new">+ Add new client member</option>
    </select>
  );
}
