import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { AlertQueueManager } from "../../src/alerts/queue";
import {
  ALERT_PRIORITY,
  type Alert,
  type AlertCategory,
} from "../../src/alerts/types";
import { createExternalSpeaker } from "../helpers";

function makeAlert(
  id: string,
  category: AlertCategory,
  severity: "low" | "medium" | "high" | "critical" = "medium",
  topicId = "topic-1"
): Alert {
  return {
    id,
    category,
    severity,
    triggerUtteranceId: `utt-${id}`,
    speaker: createExternalSpeaker("Client"),
    topicId,
    timestamp: Date.now(),
    title: `Alert ${id}`,
    message: `Message for ${id}`,
    routing: "shared",
    status: "pending",
    confidence: 0.8,
    triggerTier: 2,
  };
}

describe("AlertQueueManager", () => {
  let queue: AlertQueueManager;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new AlertQueueManager({
      maxVisible: 2,
      debounceWindow: 5000,
      recentlyShownWindow: 60_000,
    });
  });

  afterEach(() => {
    queue.clear();
    vi.useRealTimers();
  });

  describe("enqueue", () => {
    it("should display first alert when queue is empty", () => {
      const alert = makeAlert("a1", "scope_creep");
      const result = queue.enqueue(alert);

      expect(result.displayed).toBe(true);
      expect(result.deduplicated).toBe(false);
      expect(queue.getActiveCount()).toBe(1);
    });

    it("should display second alert when one is visible (maxVisible=2)", () => {
      queue.enqueue(makeAlert("a1", "scope_creep"));
      queue.enqueue(makeAlert("a2", "risky_commitment"));

      expect(queue.getActiveCount()).toBe(2);
    });

    it("should queue to pending when maxVisible reached", () => {
      queue.enqueue(makeAlert("a1", "scope_creep"));
      queue.enqueue(makeAlert("a2", "risky_commitment"));
      const result = queue.enqueue(makeAlert("a3", "missing_clarity"));

      expect(result.displayed).toBe(false);
      expect(result.deduplicated).toBe(false);
      expect(queue.getActiveCount()).toBe(2);
      expect(queue.getPendingCount()).toBe(1);
    });

    it("should evict lowest priority and display when higher priority arrives", () => {
      queue.enqueue(makeAlert("a1", "scope_creep"));
      queue.enqueue(makeAlert("a2", "missing_clarity"));

      const result = queue.enqueue(
        makeAlert("a3", "policy_violation", "critical")
      );

      expect(result.displayed).toBe(true);
      expect(result.evicted).toBeDefined();
      expect(result.evicted?.category).toBe("missing_clarity");
      expect(queue.getActiveAlerts().some((a) => a.id === "a3")).toBe(true);
    });

    it("should not evict when lower priority than active alerts", () => {
      queue.enqueue(makeAlert("a1", "policy_violation", "critical"));
      queue.enqueue(makeAlert("a2", "information_risk", "high"));

      const result = queue.enqueue(
        makeAlert("a3", "undiscussed_agenda", "low")
      );

      expect(result.displayed).toBe(false);
      expect(result.evicted).toBeUndefined();
      expect(queue.getPendingCount()).toBe(1);
    });

    it("should deduplicate same category + topic within debounce window", () => {
      queue.enqueue(makeAlert("a1", "scope_creep", "medium", "topic-1"));

      vi.advanceTimersByTime(1000);

      const result = queue.enqueue(
        makeAlert("a2", "scope_creep", "medium", "topic-1")
      );

      expect(result.deduplicated).toBe(true);
      expect(result.displayed).toBe(false);
    });

    it("should allow same category after debounce window", () => {
      queue.enqueue(makeAlert("a1", "scope_creep", "medium", "topic-1"));

      vi.advanceTimersByTime(5001);

      const result = queue.enqueue(
        makeAlert("a2", "scope_creep", "medium", "topic-1")
      );

      expect(result.deduplicated).toBe(false);
    });

    it("should not deduplicate different categories on same topic", () => {
      queue.enqueue(makeAlert("a1", "scope_creep", "medium", "topic-1"));

      const result = queue.enqueue(
        makeAlert("a2", "risky_commitment", "medium", "topic-1")
      );

      expect(result.deduplicated).toBe(false);
    });

    it("should not deduplicate same category on different topics", () => {
      queue.enqueue(makeAlert("a1", "scope_creep", "medium", "topic-1"));

      const result = queue.enqueue(
        makeAlert("a2", "scope_creep", "medium", "topic-2")
      );

      expect(result.deduplicated).toBe(false);
    });
  });

  describe("dismiss", () => {
    it("should dismiss an active alert by id", () => {
      queue.enqueue(makeAlert("a1", "scope_creep"));
      queue.enqueue(makeAlert("a2", "risky_commitment"));

      const dismissed = queue.dismiss("a1");

      expect(dismissed).toBeDefined();
      expect(dismissed?.id).toBe("a1");
      expect(dismissed?.status).toBe("dismissed");
      expect(queue.getActiveCount()).toBe(1);
    });

    it("should promote pending alert after dismissal", () => {
      queue.enqueue(makeAlert("a1", "scope_creep"));
      queue.enqueue(makeAlert("a2", "risky_commitment"));
      queue.enqueue(makeAlert("a3", "missing_clarity"));

      expect(queue.getActiveCount()).toBe(2);
      expect(queue.getPendingCount()).toBe(1);

      queue.dismiss("a1");

      expect(queue.getActiveCount()).toBe(2);
      expect(queue.getPendingCount()).toBe(0);
      expect(queue.getActiveAlerts().some((a) => a.id === "a3")).toBe(true);
    });

    it("should dismiss a pending alert", () => {
      queue.enqueue(makeAlert("a1", "scope_creep"));
      queue.enqueue(makeAlert("a2", "risky_commitment"));
      queue.enqueue(makeAlert("a3", "missing_clarity"));

      const dismissed = queue.dismiss("a3");

      expect(dismissed?.id).toBe("a3");
      expect(queue.getPendingCount()).toBe(0);
    });

    it("should return undefined for non-existent alert", () => {
      const dismissed = queue.dismiss("nonexistent");
      expect(dismissed).toBeUndefined();
    });
  });

  describe("auto-expiry", () => {
    it("should expire a low severity alert after 10 seconds", () => {
      queue.enqueue(makeAlert("a1", "scope_creep", "low"));

      expect(queue.getActiveCount()).toBe(1);

      vi.advanceTimersByTime(10_000);

      expect(queue.getActiveCount()).toBe(0);
    });

    it("should expire a medium severity alert after 15 seconds", () => {
      queue.enqueue(makeAlert("a1", "scope_creep", "medium"));

      vi.advanceTimersByTime(15_000);

      expect(queue.getActiveCount()).toBe(0);
    });

    it("should expire a high severity alert after 20 seconds", () => {
      queue.enqueue(makeAlert("a1", "policy_violation", "high"));

      vi.advanceTimersByTime(20_000);

      expect(queue.getActiveCount()).toBe(0);
    });

    it("should expire a critical severity alert after 30 seconds", () => {
      queue.enqueue(makeAlert("a1", "policy_violation", "critical"));

      vi.advanceTimersByTime(30_000);

      expect(queue.getActiveCount()).toBe(0);
    });

    it("should promote pending alert after expiry", () => {
      queue.enqueue(makeAlert("a1", "scope_creep", "low"));
      queue.enqueue(makeAlert("a2", "risky_commitment", "low"));
      queue.enqueue(makeAlert("a3", "missing_clarity", "low"));

      expect(queue.getActiveCount()).toBe(2);
      expect(queue.getPendingCount()).toBe(1);

      vi.advanceTimersByTime(10_000);

      expect(queue.getActiveCount()).toBe(1);
      expect(queue.getPendingCount()).toBe(0);
    });

    it("should set status to expired on expiry", () => {
      const alert = makeAlert("a1", "scope_creep", "low");
      queue.enqueue(alert);

      vi.advanceTimersByTime(10_000);

      const active = queue.getActiveAlerts();
      expect(active).toHaveLength(0);
    });
  });

  describe("priority ordering in pending queue", () => {
    it("should maintain priority order in pending queue", () => {
      queue.enqueue(makeAlert("a1", "policy_violation", "critical"));
      queue.enqueue(makeAlert("a2", "information_risk", "high"));

      queue.enqueue(makeAlert("a3", "undiscussed_agenda", "low"));
      queue.enqueue(makeAlert("a4", "scope_creep", "medium"));
      queue.enqueue(makeAlert("a5", "self_contradiction", "medium"));

      const pending = queue.getPendingAlerts();

      expect(
        ALERT_PRIORITY[pending[0]?.category ?? "undiscussed_agenda"]
      ).toBeLessThan(
        ALERT_PRIORITY[pending[1]?.category ?? "undiscussed_agenda"]
      );
      expect(
        ALERT_PRIORITY[pending[1]?.category ?? "undiscussed_agenda"]
      ).toBeLessThan(
        ALERT_PRIORITY[pending[2]?.category ?? "undiscussed_agenda"]
      );
    });
  });

  describe("getStats", () => {
    it("should return correct stats", () => {
      queue.enqueue(makeAlert("a1", "scope_creep"));
      queue.enqueue(makeAlert("a2", "risky_commitment"));
      queue.enqueue(makeAlert("a3", "missing_clarity"));

      const stats = queue.getStats();

      expect(stats.activeCount).toBe(2);
      expect(stats.pendingCount).toBe(1);
      expect(stats.activeCategories).toHaveLength(2);
    });
  });

  describe("clear", () => {
    it("should clear all alerts and pending", () => {
      queue.enqueue(makeAlert("a1", "scope_creep"));
      queue.enqueue(makeAlert("a2", "risky_commitment"));
      queue.enqueue(makeAlert("a3", "missing_clarity"));

      queue.clear();

      expect(queue.getActiveCount()).toBe(0);
      expect(queue.getPendingCount()).toBe(0);
    });
  });

  describe("hasAlert", () => {
    it("should find alert in active", () => {
      queue.enqueue(makeAlert("a1", "scope_creep"));
      expect(queue.hasAlert("a1")).toBe(true);
    });

    it("should find alert in pending", () => {
      queue.enqueue(makeAlert("a1", "scope_creep"));
      queue.enqueue(makeAlert("a2", "risky_commitment"));
      queue.enqueue(makeAlert("a3", "missing_clarity"));

      expect(queue.hasAlert("a3")).toBe(true);
    });

    it("should return false for non-existent alert", () => {
      expect(queue.hasAlert("nonexistent")).toBe(false);
    });
  });
});
