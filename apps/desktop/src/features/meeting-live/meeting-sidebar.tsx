import { ChevronDown, Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buttonClass,
  cx,
  inputClass,
  labelClass,
  metricChipClass,
  textareaClass,
} from "../../lib/ui";
import type { LiveCommitment, LiveParticipant } from "./types";

const WHITESPACE_SPLIT = /\s+/;

function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-border-subtle border-t first:border-t-0">
      <button
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors duration-150 hover:bg-bg-subtle/60"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span className="font-medium text-[11px] text-fg-muted">{title}</span>
        <ChevronDown
          className={cx(
            "h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-150 ease-out",
            !open && "-rotate-90"
          )}
          strokeWidth={1.5}
        />
      </button>
      {open ? <div className="px-3 pb-3">{children}</div> : null}
    </section>
  );
}

function statusBadgeClass(status: LiveCommitment["status"]): string {
  switch (status) {
    case "CONFIRMED":
      return metricChipClass("success");
    case "TENTATIVE":
      return metricChipClass("warning");
    case "CONTRADICTED":
      return "inline-flex items-center rounded-[4px] border border-danger-fg bg-danger-bg px-1.5 py-px font-medium text-[10px] text-danger-fg leading-snug";
    default:
      return metricChipClass("muted");
  }
}

function confidenceDotClass(confidence: number): string {
  if (confidence >= 0.85) {
    return "bg-success-fg";
  }
  if (confidence >= 0.6) {
    return "bg-warning-fg";
  }
  return "bg-fg-subtle";
}

function formatEvidenceClock(meetingStartMs: number, ts: number): string {
  const delta = Math.max(0, ts - meetingStartMs);
  const totalSec = Math.floor(delta / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface MeetingSidebarProps {
  sessionId: string;
  participants: LiveParticipant[];
  commitments: LiveCommitment[];
  meetingStartedAtMs: number;
  onEvidenceClick: (utteranceId: string) => void;
}

export function MeetingSidebar({
  sessionId,
  participants,
  commitments,
  meetingStartedAtMs,
  onEvidenceClick,
}: MeetingSidebarProps) {
  const storageKey = `larity-meeting-notes-${sessionId}`;
  const [notes, setNotes] = useState("");
  const [notesSavedVersion, setNotesSavedVersion] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

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

    return (
      <div className="group flex items-start gap-2 py-2 first:pt-0" key={p.id}>
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-1)] border border-border bg-bg-subtle font-semibold text-[10px] text-fg">
          {initials || "?"}
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
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
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-medium text-[13px] text-fg">
                {display}
              </span>
              {p.isSelf ? (
                <span className="rounded-[4px] bg-accent-subtle px-1.5 py-px font-medium text-[10px] text-accent">
                  You
                </span>
              ) : null}
              <span className="rounded-[4px] border border-border-strong bg-transparent px-1.5 py-px font-medium text-[10px] text-fg-muted leading-snug">
                {p.type}
              </span>
              <span
                aria-label={`Identification confidence ${Math.round(p.confidence * 100)} percent`}
                className={cx(
                  "inline-block h-1 w-1 shrink-0 rounded-[2px]",
                  confidenceDotClass(p.confidence)
                )}
                role="img"
              />
              <button
                aria-label={`Correct name for ${display}`}
                className={cx(
                  buttonClass({ variant: "ghost", icon: true }),
                  "opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                )}
                onClick={() => setEditingId(p.id)}
                type="button"
              >
                <Pencil className="h-3 w-3" strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-border border-l bg-bg-elevated">
      <CollapsibleSection title="Participants">
        <div className="grid gap-1">
          <p className="m-0 font-medium text-[10px] text-fg-subtle">Team</p>
          {team.length === 0 ? (
            <p className="m-0 text-fg-muted text-xs">No team speakers yet.</p>
          ) : (
            team.map(renderParticipantRow)
          )}
        </div>
        <div className="mt-3 grid gap-1 border-border-subtle border-t pt-3">
          <p className="m-0 font-medium text-[10px] text-fg-subtle">External</p>
          {external.length === 0 ? (
            <p className="m-0 text-fg-muted text-xs">
              No external speakers yet.
            </p>
          ) : (
            external.map(renderParticipantRow)
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Commitment ledger">
        {sortedCommitments.length === 0 ? (
          <p className="m-0 text-fg-muted text-xs">
            No commitments classified yet.
          </p>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0">
            {sortedCommitments.map((c) => (
              <li className="grid gap-1.5" key={c.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={statusBadgeClass(c.status)}>{c.status}</span>
                  <button
                    className="font-mono text-[11px] text-accent hover:underline"
                    onClick={() => onEvidenceClick(c.sourceUtteranceId)}
                    type="button"
                  >
                    [{formatEvidenceClock(meetingStartedAtMs, c.timestamp)}]
                  </button>
                </div>
                <p className="m-0 text-[13px] text-fg leading-snug">{c.text}</p>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Notes scratchpad">
        <label className={labelClass} htmlFor={`notes-${sessionId}`}>
          Personal notes · stays on-device
        </label>
        <textarea
          className={cx(textareaClass, "mt-1 min-h-28")}
          id={`notes-${sessionId}`}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Capture reminders while this meeting runs."
          value={notes}
        />
        {dirty ? (
          <button
            className={cx(
              buttonClass({ variant: "ghost", size: "sm" }),
              "mt-2"
            )}
            onClick={saveNotes}
            type="button"
          >
            Save locally
          </button>
        ) : null}
      </CollapsibleSection>
    </aside>
  );
}
