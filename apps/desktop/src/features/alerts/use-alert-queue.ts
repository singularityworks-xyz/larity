import { useCallback, useEffect, useRef, useState } from "react";
import { ALERT_EXPIRY_MS, ALERT_PRIORITY, type MeetingAlert } from "./types";

interface UseAlertQueueResult {
  visibleAlerts: MeetingAlert[];
  alertHistory: MeetingAlert[];
  dismissAlert: (id: string) => void;
  addAlert: (alert: MeetingAlert) => void;
  clearAll: () => void;
}

export function useAlertQueue(maxVisible = 2): UseAlertQueueResult {
  const [visibleAlerts, setVisibleAlerts] = useState<MeetingAlert[]>([]);
  const [alertHistory, setAlertHistory] = useState<MeetingAlert[]>([]);
  const timeoutsRef = useRef<Map<string, number>>(new Map());

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      for (const timerId of timeoutsRef.current.values()) {
        window.clearTimeout(timerId);
      }
      timeoutsRef.current.clear();
    };
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setVisibleAlerts((prev) => prev.filter((a) => a.id !== id));
    const timer = timeoutsRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const addAlert = useCallback(
    (alert: MeetingAlert) => {
      setAlertHistory((prev) => {
        if (prev.some((a) => a.id === alert.id)) {
          return prev;
        }
        return [alert, ...prev];
      });

      setVisibleAlerts((prev) => {
        // Don't add duplicate
        if (prev.some((a) => a.id === alert.id)) {
          return prev;
        }

        const newAlerts = [...prev, alert].sort((a, b) => {
          // Lower priority number = higher priority to show
          const priorityDiff =
            ALERT_PRIORITY[a.category] - ALERT_PRIORITY[b.category];
          if (priorityDiff !== 0) {
            return priorityDiff;
          }
          // Fallback to most recent
          return b.timestamp - a.timestamp;
        });

        // Keep only up to maxVisible
        return newAlerts.slice(0, maxVisible);
      });

      // Skip or reset timer if duplicate
      const existingTimer = timeoutsRef.current.get(alert.id);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }

      // Schedule auto-dismiss
      const expiryMs = ALERT_EXPIRY_MS[alert.severity];
      const timerId = window.setTimeout(() => {
        dismissAlert(alert.id);
      }, expiryMs);

      timeoutsRef.current.set(alert.id, timerId);
    },
    [maxVisible, dismissAlert]
  );

  const clearAll = useCallback(() => {
    setVisibleAlerts([]);
    setAlertHistory([]);
    for (const timerId of timeoutsRef.current.values()) {
      window.clearTimeout(timerId);
    }
    timeoutsRef.current.clear();
  }, []);

  return {
    visibleAlerts,
    alertHistory,
    dismissAlert,
    addAlert,
    clearAll,
  };
}
