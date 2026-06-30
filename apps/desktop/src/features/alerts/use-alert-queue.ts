import { useCallback, useEffect, useRef, useState } from "react";
import { ALERT_EXPIRY_MS, ALERT_PRIORITY, type MeetingAlert } from "./types";

interface UseAlertQueueResult {
  addAlert: (alert: MeetingAlert) => void;
  alertHistory: MeetingAlert[];
  clearAll: () => void;
  dismissAlert: (id: string) => void;
  exitingIds: Set<string>;
  pendingCount: number;
  visibleAlerts: MeetingAlert[];
}

const sortAlerts = (alerts: MeetingAlert[], chronological = false) =>
  [...alerts].sort((a, b) => {
    if (chronological) {
      return a.timestamp - b.timestamp;
    }
    const priorityDiff =
      ALERT_PRIORITY[a.category] - ALERT_PRIORITY[b.category];
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return b.timestamp - a.timestamp;
  });

export function useAlertQueue(
  maxVisible = 2,
  chronological = false,
  disableExpiry = false
): UseAlertQueueResult {
  const [visibleAlerts, setVisibleAlerts] = useState<MeetingAlert[]>([]);
  const [alertHistory, setAlertHistory] = useState<MeetingAlert[]>([]);
  const [queue, setQueue] = useState<MeetingAlert[]>([]);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const autoDismissTimeoutsRef = useRef<Map<string, number>>(new Map());
  const animTimeoutsRef = useRef<Map<string, number>>(new Map());

  useEffect(
    () => () => {
      for (const timerId of autoDismissTimeoutsRef.current.values()) {
        window.clearTimeout(timerId);
      }
      for (const timerId of animTimeoutsRef.current.values()) {
        window.clearTimeout(timerId);
      }
    },
    []
  );

  const dismissAlert = useCallback((id: string) => {
    setExitingIds((prev) => new Set([...prev, id]));

    // Cancel the auto-dismiss timer — the exit animation replaces it
    const existingAuto = autoDismissTimeoutsRef.current.get(id);
    if (existingAuto) {
      window.clearTimeout(existingAuto);
      autoDismissTimeoutsRef.current.delete(id);
    }

    const animTimerId = window.setTimeout(() => {
      setVisibleAlerts((prev) => prev.filter((a) => a.id !== id));
      setExitingIds((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
      animTimeoutsRef.current.delete(id);
    }, 220);

    animTimeoutsRef.current.set(id, animTimerId);
  }, []);

  // Promote from queue when space opens up
  useEffect(() => {
    if (queue.length > 0 && visibleAlerts.length < maxVisible) {
      const nextAlert = queue[0];
      if (!nextAlert) {
        return;
      }
      setQueue((prev) => prev.slice(1));
      setVisibleAlerts((prev) => {
        if (prev.some((a) => a.id === nextAlert.id)) {
          return prev;
        }

        const existingTimer = autoDismissTimeoutsRef.current.get(nextAlert.id);
        if (existingTimer) {
          window.clearTimeout(existingTimer);
        }

        if (!disableExpiry) {
          const expiryMs = ALERT_EXPIRY_MS[nextAlert.severity];
          const timerId = window.setTimeout(() => {
            dismissAlert(nextAlert.id);
          }, expiryMs);
          autoDismissTimeoutsRef.current.set(nextAlert.id, timerId);
        }

        return sortAlerts([...prev, nextAlert], chronological);
      });
    }
  }, [
    queue,
    visibleAlerts.length,
    maxVisible,
    dismissAlert,
    chronological,
    disableExpiry,
  ]);

  const addAlert = useCallback(
    (alert: MeetingAlert) => {
      setAlertHistory((prev) =>
        prev.some((a) => a.id === alert.id) ? prev : [alert, ...prev]
      );

      setVisibleAlerts((prev) => {
        if (prev.some((a) => a.id === alert.id)) {
          return prev;
        }

        if (prev.length >= maxVisible) {
          // Immediately dismiss the oldest active alert
          const oldestAlert = [...prev].sort(
            (a, b) => a.timestamp - b.timestamp
          )[0];
          if (oldestAlert) {
            dismissAlert(oldestAlert.id);
          }
        }

        const existingTimer = autoDismissTimeoutsRef.current.get(alert.id);
        if (existingTimer) {
          window.clearTimeout(existingTimer);
        }

        if (!disableExpiry) {
          const expiryMs = ALERT_EXPIRY_MS[alert.severity];
          const timerId = window.setTimeout(() => {
            dismissAlert(alert.id);
          }, expiryMs);
          autoDismissTimeoutsRef.current.set(alert.id, timerId);
        }

        const newAlerts = sortAlerts([...prev, alert], chronological);
        return newAlerts;
      });
    },
    [maxVisible, dismissAlert, chronological, disableExpiry]
  );

  const clearAll = useCallback(() => {
    setVisibleAlerts([]);
    setAlertHistory([]);
    setQueue([]);
    setExitingIds(new Set());
    for (const timerId of autoDismissTimeoutsRef.current.values()) {
      window.clearTimeout(timerId);
    }
    for (const timerId of animTimeoutsRef.current.values()) {
      window.clearTimeout(timerId);
    }
    autoDismissTimeoutsRef.current.clear();
    animTimeoutsRef.current.clear();
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
