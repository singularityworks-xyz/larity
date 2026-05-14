import { useCallback, useEffect, useRef, useState } from "react";
import { ALERT_EXPIRY_MS, ALERT_PRIORITY, type MeetingAlert } from "./types";

interface UseAlertQueueResult {
  visibleAlerts: MeetingAlert[];
  alertHistory: MeetingAlert[];
  dismissAlert: (id: string) => void;
  addAlert: (alert: MeetingAlert) => void;
  clearAll: () => void;
  pendingCount: number;
  exitingIds: Set<string>;
}

export function useAlertQueue(maxVisible = 2): UseAlertQueueResult {
  const [visibleAlerts, setVisibleAlerts] = useState<MeetingAlert[]>([]);
  const [alertHistory, setAlertHistory] = useState<MeetingAlert[]>([]);
  const [queue, setQueue] = useState<MeetingAlert[]>([]);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const timeoutsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return () => {
      for (const timerId of timeoutsRef.current.values()) {
        window.clearTimeout(timerId);
      }
      timeoutsRef.current.clear();
    };
  }, []);

  // Promote from queue when space opens up
  useEffect(() => {
    if (queue.length > 0 && visibleAlerts.length < maxVisible) {
      const nextAlert = queue[0];
      setQueue((prev) => prev.slice(1));
      setVisibleAlerts((prev) => {
        if (prev.some((a) => a.id === nextAlert.id)) {
          return prev;
        }
        return [...prev, nextAlert];
      });
    }
  }, [queue, visibleAlerts.length, maxVisible]);

  const dismissAlert = useCallback((id: string) => {
    setExitingIds((prev) => new Set([...prev, id]));

    const animTimerId = window.setTimeout(() => {
      setVisibleAlerts((prev) => prev.filter((a) => a.id !== id));
      setExitingIds((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
      const timer = timeoutsRef.current.get(id);
      if (timer) {
        window.clearTimeout(timer);
        timeoutsRef.current.delete(id);
      }
    }, 220);

    timeoutsRef.current.set(id, animTimerId);
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
        if (prev.some((a) => a.id === alert.id)) {
          return prev;
        }

        if (prev.length >= maxVisible) {
          // Queue it instead
          setQueue((q) =>
            q.some((a) => a.id === alert.id) ? q : [...q, alert]
          );
          return prev;
        }

        const newAlerts = [...prev, alert].sort((a, b) => {
          const priorityDiff =
            ALERT_PRIORITY[a.category] - ALERT_PRIORITY[b.category];
          if (priorityDiff !== 0) {
            return priorityDiff;
          }
          return b.timestamp - a.timestamp;
        });

        return newAlerts.slice(0, maxVisible);
      });

      const existingTimer = timeoutsRef.current.get(alert.id);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }

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
    setQueue([]);
    setExitingIds(new Set());
    for (const timerId of timeoutsRef.current.values()) {
      window.clearTimeout(timerId);
    }
    timeoutsRef.current.clear();
  }, []);

  const pendingCount = queue.length;

  return {
    visibleAlerts,
    alertHistory,
    dismissAlert,
    addAlert,
    clearAll,
    pendingCount,
    exitingIds,
  };
}
