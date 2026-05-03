import {
  ALERT_PRIORITY,
  ALERT_UX_RULES,
  type Alert,
  type AlertCategory,
  type AlertSeverity,
} from "./types";

interface QueuedAlert {
  alert: Alert;
  enqueuedAt: number;
}

export interface TimeProvider {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(timer: unknown): void;
}

const defaultTimeProvider: TimeProvider = {
  now: () => Date.now(),
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (timer) => clearTimeout(timer as number | NodeJS.Timeout),
};

export class AlertQueueManager {
  private activeAlerts: QueuedAlert[] = [];
  private pendingQueue: QueuedAlert[] = [];
  private readonly recentlyShown: Map<string, number> = new Map();
  private readonly maxVisible: number;
  private readonly debounceWindow: number;
  private readonly recentlyShownWindow: number;
  private readonly timeProvider: TimeProvider;
  private readonly expiryTimers: Map<string, unknown> = new Map();

  constructor(config?: {
    maxVisible?: number;
    debounceWindow?: number;
    recentlyShownWindow?: number;
    timeProvider?: TimeProvider;
  }) {
    this.maxVisible = config?.maxVisible ?? ALERT_UX_RULES.maxVisibleAlerts;
    this.debounceWindow =
      config?.debounceWindow ?? ALERT_UX_RULES.debounceWindow;
    this.recentlyShownWindow =
      config?.recentlyShownWindow ?? ALERT_UX_RULES.recentlyShownWindow;
    this.timeProvider = config?.timeProvider ?? defaultTimeProvider;
  }

  enqueue(alert: Alert): {
    displayed: boolean;
    evicted?: Alert;
    deduplicated: boolean;
  } {
    this.cleanupRecentlyShown();

    const dedupeKey = this.dedupeKey(alert);
    const lastShown = this.recentlyShown.get(dedupeKey);
    if (
      lastShown !== undefined &&
      this.timeProvider.now() - lastShown < this.debounceWindow
    ) {
      return { displayed: false, deduplicated: true };
    }

    const queued: QueuedAlert = { alert, enqueuedAt: this.timeProvider.now() };

    if (this.activeAlerts.length < this.maxVisible) {
      this.addToActive(queued);
      return { displayed: true, deduplicated: false };
    }

    const lowestActivePriority = this.getLowestPriorityActive();
    if (
      lowestActivePriority &&
      ALERT_PRIORITY[alert.category] <
        ALERT_PRIORITY[lowestActivePriority.alert.category]
    ) {
      const evicted = this.evictLowestPriority();
      this.addToActive(queued);
      return { displayed: true, evicted, deduplicated: false };
    }

    this.insertToPending(queued);
    return { displayed: false, deduplicated: false };
  }

  dismiss(alertId: string): Alert | undefined {
    const idx = this.activeAlerts.findIndex((q) => q.alert.id === alertId);
    if (idx !== -1) {
      const removed = this.activeAlerts.splice(idx, 1)[0];
      if (!removed) {
        return undefined;
      }
      this.clearExpiryTimer(alertId);
      removed.alert.status = "dismissed";
      this.markRecentlyShown(removed.alert);
      this.promoteFromPending();
      return removed.alert;
    }

    const pendingIdx = this.pendingQueue.findIndex(
      (q) => q.alert.id === alertId
    );
    if (pendingIdx !== -1) {
      const removed = this.pendingQueue.splice(pendingIdx, 1)[0];
      if (!removed) {
        return undefined;
      }
      removed.alert.status = "dismissed";
      this.markRecentlyShown(removed.alert);
      return removed.alert;
    }

    return undefined;
  }

  getActiveAlerts(): Alert[] {
    return this.activeAlerts.map((q) => q.alert);
  }

  getPendingAlerts(): Alert[] {
    return this.pendingQueue.map((q) => q.alert);
  }

  getPendingCount(): number {
    return this.pendingQueue.length;
  }

  getActiveCount(): number {
    return this.activeAlerts.length;
  }

  hasAlert(alertId: string): boolean {
    return (
      this.activeAlerts.some((q) => q.alert.id === alertId) ||
      this.pendingQueue.some((q) => q.alert.id === alertId)
    );
  }

  clear(): void {
    for (const timer of this.expiryTimers.values()) {
      this.timeProvider.clearTimeout(timer);
    }
    this.expiryTimers.clear();
    this.activeAlerts = [];
    this.pendingQueue = [];
    this.recentlyShown.clear();
  }

  getStats(): {
    activeCount: number;
    pendingCount: number;
    recentlyShownCount: number;
    activeCategories: AlertCategory[];
  } {
    return {
      activeCount: this.activeAlerts.length,
      pendingCount: this.pendingQueue.length,
      recentlyShownCount: this.recentlyShown.size,
      activeCategories: this.activeAlerts.map((q) => q.alert.category),
    };
  }

  private addToActive(queued: QueuedAlert): void {
    this.activeAlerts.push(queued);
    queued.alert.status = "shown";
    queued.alert.shownAt = this.timeProvider.now();
    queued.alert.expiresAt =
      this.timeProvider.now() + this.getExpiryMs(queued.alert.severity);

    this.markRecentlyShown(queued.alert);
    this.scheduleExpiry(queued.alert);
  }

  private scheduleExpiry(alert: Alert): void {
    const expiryMs = this.getExpiryMs(alert.severity);

    const timer = this.timeProvider.setTimeout(() => {
      this.expireAlert(alert.id);
    }, expiryMs);

    this.expiryTimers.set(alert.id, timer);
  }

  private expireAlert(alertId: string): void {
    const idx = this.activeAlerts.findIndex((q) => q.alert.id === alertId);
    if (idx === -1) {
      return;
    }

    const removed = this.activeAlerts.splice(idx, 1)[0];
    if (!removed) {
      return;
    }
    removed.alert.status = "expired";
    this.markRecentlyShown(removed.alert);
    this.expiryTimers.delete(alertId);
    this.promoteFromPending();
  }

  private clearExpiryTimer(alertId: string): void {
    const timer = this.expiryTimers.get(alertId);
    if (timer) {
      this.timeProvider.clearTimeout(timer);
      this.expiryTimers.delete(alertId);
    }
  }

  private promoteFromPending(): void {
    while (
      this.activeAlerts.length < this.maxVisible &&
      this.pendingQueue.length > 0
    ) {
      const next = this.pendingQueue.shift();
      if (next) {
        this.addToActive(next);
      }
    }
  }

  private insertToPending(queued: QueuedAlert): void {
    const priority = ALERT_PRIORITY[queued.alert.category];
    let insertIdx = this.pendingQueue.length;

    for (let i = 0; i < this.pendingQueue.length; i++) {
      const existingPriority =
        ALERT_PRIORITY[
          this.pendingQueue[i]?.alert.category ?? "undiscussed_agenda"
        ];
      if (priority < existingPriority) {
        insertIdx = i;
        break;
      }
    }

    this.pendingQueue.splice(insertIdx, 0, queued);
  }

  private getLowestPriorityActive(): QueuedAlert | undefined {
    let lowest: QueuedAlert | undefined;

    for (const queued of this.activeAlerts) {
      if (
        !lowest ||
        ALERT_PRIORITY[queued.alert.category] >
          ALERT_PRIORITY[lowest.alert.category]
      ) {
        lowest = queued;
      }
    }

    return lowest;
  }

  private evictLowestPriority(): Alert {
    const lowest = this.getLowestPriorityActive();

    if (!lowest) {
      throw new Error("No active alerts to evict");
    }

    const idx = this.activeAlerts.indexOf(lowest);
    this.activeAlerts.splice(idx, 1);
    this.clearExpiryTimer(lowest.alert.id);

    lowest.alert.status = "dismissed";
    this.markRecentlyShown(lowest.alert);

    return lowest.alert;
  }

  private markRecentlyShown(alert: Alert): void {
    const key = this.dedupeKey(alert);
    this.recentlyShown.set(key, this.timeProvider.now());
  }

  private cleanupRecentlyShown(): void {
    const now = this.timeProvider.now();
    for (const [key, timestamp] of this.recentlyShown) {
      if (now - timestamp > this.recentlyShownWindow) {
        this.recentlyShown.delete(key);
      }
    }
  }

  private dedupeKey(alert: Alert): string {
    return `${alert.category}:${alert.topicId ?? "no-topic"}`;
  }

  private getExpiryMs(severity: AlertSeverity): number {
    return ALERT_UX_RULES.displayDuration[severity];
  }
}
