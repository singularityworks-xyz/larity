import { AlertCard } from "../alerts/alert-card";
import type { MeetingAlert } from "../alerts/types";

const EMPTY_EXITING_SET = new Set<string>();

interface AlertRegionProps {
  visibleAlerts: MeetingAlert[];
  exitingIds?: Set<string>;
  alertsMuted: boolean;
  expandedAlertId: string | null;
  onDismiss: (id: string) => void;
  onToggleExpand: (id: string | null) => void;
}

export function AlertRegion({
  visibleAlerts,
  exitingIds = EMPTY_EXITING_SET,
  alertsMuted,
  expandedAlertId,
  onDismiss,
  onToggleExpand,
}: AlertRegionProps) {
  if (alertsMuted) {
    return (
      <section aria-live="polite" className="flex-1 overflow-y-auto px-3 py-2">
        <span className="sr-only">Alerts muted</span>
      </section>
    );
  }

  return (
    <section
      aria-live="polite"
      className="z-[1] flex-1 overflow-y-auto px-3 py-2"
    >
      <div className="grid gap-2">
        {visibleAlerts.map((alert, index) => (
          <AlertCard
            alert={alert}
            expandedId={expandedAlertId}
            isExiting={exitingIds.has(alert.id)}
            key={alert.id}
            onDismiss={() => onDismiss(alert.id)}
            onToggleExpand={() =>
              onToggleExpand(expandedAlertId === alert.id ? null : alert.id)
            }
            style={{ animationDelay: `${index * 50}ms` }}
          />
        ))}
      </div>
    </section>
  );
}
