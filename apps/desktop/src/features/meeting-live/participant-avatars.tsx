import { Crown } from "lucide-react";
import { cx } from "../../lib/ui";
import type { LiveParticipant } from "./types";

const WHITESPACE_RE = /\s+/;
const MAX_VISIBLE = 5;

function participantInitials(name: string): string {
  return name
    .split(WHITESPACE_RE)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function connectionDotClass(isConnected: boolean): string {
  return isConnected ? "bg-success-fg" : "bg-fg-subtle/40";
}

interface ParticipantAvatarsProps {
  participants: LiveParticipant[];
  className?: string;
}

export function ParticipantAvatars({
  participants,
  className,
}: ParticipantAvatarsProps) {
  const team = participants.filter((p) => p.type === "TEAM");
  if (team.length === 0) {
    return null;
  }

  const visible = team.slice(0, MAX_VISIBLE);
  const overflow = team.length - MAX_VISIBLE;

  return (
    <section
      aria-label={`${team.length} team member${team.length !== 1 ? "s" : ""}`}
      className={cx("inline-flex items-center -space-x-1.5", className)}
    >
      {visible.map((p) => (
        <span
          className={cx(
            "relative inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-bg font-semibold text-[8px] text-fg-muted",
            p.isSelf ? "bg-accent-subtle text-accent" : "bg-bg-subtle"
          )}
          key={p.id}
          title={`${p.name}${p.isHost ? " (Host)" : ""}${p.isSelf ? " (You)" : ""}`}
        >
          {participantInitials(p.name) || "?"}
          <span
            aria-hidden
            className={cx(
              "absolute -right-px -bottom-px inline-block h-[7px] w-[7px] rounded-full border-2 border-bg",
              connectionDotClass(p.isConnected)
            )}
          />
          {p.isHost ? (
            <Crown
              aria-label="Host"
              className="absolute -top-1 -right-1 h-[10px] w-[10px] text-accent"
              strokeWidth={2}
            />
          ) : null}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-bg bg-bg-emphasis font-medium text-[8px] text-fg-subtle">
          +{overflow}
        </span>
      ) : null}
    </section>
  );
}

interface ParticipantIdentificationStatusProps {
  participant: LiveParticipant;
}

export function ParticipantIdentificationStatus({
  participant,
}: ParticipantIdentificationStatusProps) {
  if (participant.type !== "TEAM") {
    return null;
  }

  const isIdentified = participant.confidence >= 0.6;
  const label = isIdentified ? "Identified" : "Pending identification";

  return (
    <abbr
      className={cx(
        "inline-flex items-center gap-1 rounded-[3px] px-1 py-px font-medium text-[9px] leading-none no-underline",
        isIdentified
          ? "bg-success-bg text-success-fg"
          : "border border-border-strong border-dashed bg-bg-subtle text-fg-subtle"
      )}
      title={label}
    >
      <span
        aria-hidden
        className={cx(
          "inline-block h-1 w-1 rounded-full",
          isIdentified ? "bg-success-fg" : "bg-fg-subtle"
        )}
      />
      {isIdentified ? "Identified" : "Pending"}
    </abbr>
  );
}
