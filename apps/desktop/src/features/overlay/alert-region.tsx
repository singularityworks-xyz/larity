import { ChevronRight, X } from "lucide-react";
import { cx } from "../../lib/ui";
import type { AlertSeverity, OverlayAlert } from "./types";

const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  critical: "bg-danger-fg",
  warning: "bg-warning-fg",
  info: "bg-info-fg",
};

const SEVERITY_BORDERS: Record<AlertSeverity, string> = {
  critical: "border-l-danger-fg",
  warning: "border-l-warning-fg",
  info: "border-l-info-fg",
};

function AlertCard({
  alert,
  isExpanded,
  onToggleExpand,
  onDismiss,
}: {
  alert: OverlayAlert;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className={cx(
        "animate-[overlay-alert-in_0.3s_cubic-bezier(0.16,1,0.3,1)] rounded-lg border border-white/[0.04] border-l-2 bg-white/[0.02] px-3 py-2.5 transition-colors duration-150 hover:bg-white/[0.04]",
        SEVERITY_BORDERS[alert.severity],
        alert.isShared && "border-l-[3px]"
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cx(
            "mt-[5px] inline-block h-1.5 w-1.5 shrink-0 rounded-full",
            SEVERITY_COLORS[alert.severity]
          )}
          title={`${alert.severity} severity`}
        />
        <div className="min-w-0 flex-1">
          <p className="m-0 font-medium text-[11.5px] text-fg leading-snug">
            {alert.summary}
          </p>
          {alert.isShared ? (
            <span className="mt-1 inline-block rounded-[3px] bg-accent-subtle px-1 py-px font-medium text-[9px] text-accent leading-none">
              SHARED
            </span>
          ) : null}
        </div>
        <button
          aria-label="Dismiss alert"
          className="mt-0.5 shrink-0 rounded-md p-0.5 text-fg-subtle transition-colors duration-100 [-webkit-app-region:no-drag] [app-region:no-drag] hover:bg-white/[0.06] hover:text-fg"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          type="button"
        >
          <X className="h-3 w-3" strokeWidth={2} />
        </button>
      </div>

      <button
        aria-controls={`${alert.id}-why-panel`}
        aria-expanded={isExpanded}
        className={cx(
          "mt-1.5 inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 font-medium text-[10px] transition-colors duration-100 [-webkit-app-region:no-drag] [app-region:no-drag]",
          isExpanded
            ? "bg-white/[0.06] text-fg"
            : "text-fg-subtle hover:text-fg"
        )}
        onClick={onToggleExpand}
        type="button"
      >
        Why?
        <ChevronRight
          className={cx(
            "h-2.5 w-2.5 transition-transform duration-150",
            isExpanded && "rotate-90"
          )}
          strokeWidth={2}
        />
      </button>

      {isExpanded && alert.evidence ? (
        <div
          className="mt-2 grid gap-1.5 border-white/[0.04] border-t pt-2"
          id={`${alert.id}-why-panel`}
        >
          {alert.evidence.utterance ? (
            <div>
              <p className="m-0 font-medium text-[9px] text-fg-subtle uppercase tracking-wider">
                Utterance
              </p>
              <p className="m-0 mt-0.5 font-mono text-[11px] text-fg-muted leading-relaxed">
                &ldquo;{alert.evidence.utterance}&rdquo;
              </p>
            </div>
          ) : null}
          {alert.evidence.reasoning ? (
            <div>
              <p className="m-0 font-medium text-[9px] text-fg-subtle uppercase tracking-wider">
                Reasoning
              </p>
              <p className="m-0 mt-0.5 text-[11px] text-fg-muted leading-relaxed">
                {alert.evidence.reasoning}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface AlertRegionProps {
  visibleAlerts: OverlayAlert[];
  alertsMuted: boolean;
  expandedAlertId: string | null;
  onDismiss: (id: string) => void;
  onToggleExpand: (id: string | null) => void;
}

export function AlertRegion({
  visibleAlerts,
  alertsMuted,
  expandedAlertId,
  onDismiss,
  onToggleExpand,
}: AlertRegionProps) {
  if (alertsMuted) {
    return (
      <div className="min-h-[80px] flex-1 overflow-y-auto px-3 py-2">
        <div className="flex h-full items-center justify-center">
          <p className="m-0 font-medium text-[11px] text-fg-subtle">
            Alerts muted
          </p>
        </div>
      </div>
    );
  }

  if (visibleAlerts.length === 0) {
    return (
      <div className="min-h-[80px] flex-1 overflow-y-auto px-3 py-2">
        <div className="flex h-full items-center justify-center">
          <p className="m-0 font-medium text-[11px] text-fg-subtle/50">
            No active alerts
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80px] flex-1 overflow-y-auto px-3 py-2">
      <div className="grid gap-2">
        {visibleAlerts.map((alert) => (
          <AlertCard
            alert={alert}
            isExpanded={expandedAlertId === alert.id}
            key={alert.id}
            onDismiss={() => onDismiss(alert.id)}
            onToggleExpand={() =>
              onToggleExpand(expandedAlertId === alert.id ? null : alert.id)
            }
          />
        ))}
      </div>
    </div>
  );
}
