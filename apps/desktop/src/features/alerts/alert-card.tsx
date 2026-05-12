import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  Expand,
  Gauge,
  GitBranch,
  HelpCircle,
  ListChecks,
  Lock,
  Mic,
  ShieldAlert,
  Undo2,
  User,
  Users,
  UserX,
  X,
} from "lucide-react";
import { ALERT_CATEGORY_META, type MeetingAlert } from "./types";

interface AlertCardProps {
  alert: MeetingAlert;
  onDismiss?: () => void;
  expandedId?: string | null;
  onToggleExpand?: (id: string) => void;
  isHistoryView?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: Required for dynamic component loading
const ICON_MAP: Record<string, any> = {
  "git-branch": GitBranch,
  users: Users,
  "alert-triangle": AlertTriangle,
  expand: Expand,
  "undo-2": Undo2,
  "help-circle": HelpCircle,
  lock: Lock,
  mic: Mic,
  gauge: Gauge,
  "shield-alert": ShieldAlert,
  "user-x": UserX,
  "list-checks": ListChecks,
};

export function AlertCard({
  alert,
  onDismiss,
  expandedId,
  onToggleExpand,
  isHistoryView = false,
}: AlertCardProps) {
  const isExpanded = expandedId === alert.id;

  const meta = ALERT_CATEGORY_META[alert.category];

  const isCritical = alert.severity === "critical";
  const bgClass = isCritical ? "bg-danger-bg" : "bg-bg-elevated";

  const routingColorClass =
    alert.routing === "shared" ? "border-l-accent" : "border-l-warning-fg";

  const IconComponent = ICON_MAP[meta.iconKey] || AlertCircle;

  return (
    <div
      className={`relative flex w-full flex-col rounded-none border border-border text-sm ${bgClass} border-l-[2px] ${routingColorClass}`}
    >
      <div className="flex flex-col gap-2 p-3 px-4">
        {/* Header */}
        <div className="flex flex-row items-start justify-between gap-2">
          <div className="flex flex-row items-center gap-2 font-medium text-fg-muted">
            <IconComponent size={14} />
            <span className="capitalize">{alert.severity}</span>
            <span>&middot;</span>
            <span>{meta.title}</span>
          </div>
          <div className="whitespace-nowrap font-mono text-fg-muted text-xs">
            {new Date(alert.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </div>
        </div>

        {/* Message */}
        <div className="break-words font-medium text-fg leading-snug">
          {alert.message || alert.title}
        </div>

        {/* Footer Actions */}
        <div className="mt-1 flex flex-row items-center justify-between">
          <button
            className="flex items-center gap-1 text-fg-muted text-xs transition-colors hover:text-fg"
            onClick={() => onToggleExpand?.(alert.id)}
            type="button"
          >
            Why?{" "}
            <ChevronDown
              className={`transform transition-transform ${isExpanded ? "rotate-180" : ""}`}
              size={14}
            />
          </button>

          {!isHistoryView && onDismiss && (
            <button
              className="flex items-center gap-1 text-fg-muted text-xs transition-colors hover:text-fg"
              onClick={onDismiss}
              type="button"
            >
              Dismiss <X size={14} />
            </button>
          )}
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="fade-in slide-in-from-top-1 mt-2 flex animate-in flex-col gap-3 border-border-subtle border-t pt-3 duration-fast">
            {alert.evidence?.utterance && (
              <div className="whitespace-pre-wrap border-border-subtle border-l pl-3 font-mono text-fg-muted text-xs">
                "{alert.evidence.utterance}"
              </div>
            )}

            {alert.evidence?.reasoning && (
              <div className="text-fg text-xs">{alert.evidence.reasoning}</div>
            )}

            <div className="flex items-center gap-2 text-fg-muted text-xs">
              {alert.routing === "shared" ? (
                <>
                  <Users size={12} /> Shared with team
                </>
              ) : (
                <>
                  <User size={12} /> Personal alert
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
