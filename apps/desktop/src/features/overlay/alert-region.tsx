import { AlertCard } from "../alerts/alert-card";
import type { MeetingAlert } from "../alerts/types";

interface AlertRegionProps {
  visibleAlerts: MeetingAlert[];
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
            expandedId={expandedAlertId}
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
