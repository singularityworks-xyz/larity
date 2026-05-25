process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.LOG_LEVEL = "debug";

import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import Redis from "ioredis";
import { AlertPublisher } from "../../../packages/meeting-mode/src/alerts/publisher";
import { MeetingPipelineEngine } from "../../../packages/meeting-mode/src/pipeline/engine";
import { PreFilter } from "../../../packages/meeting-mode/src/pipeline/pre-filter";
import { Tier1StructuralDetector } from "../../../packages/meeting-mode/src/pipeline/tier1";
import { Tier2Classifier } from "../../../packages/meeting-mode/src/pipeline/tier2";
import { Tier4DeepReasoner } from "../../../packages/meeting-mode/src/pipeline/tier4";
import { SpeakerManager } from "../../../packages/meeting-mode/src/speaker/manager";
import {
  startSubscriber,
  stopSubscriber,
} from "../../../packages/meeting-mode/src/subscriber";
import { UtteranceFinalizer } from "../../../packages/meeting-mode/src/utterance/finalizer";
import type { Utterance } from "../../../packages/meeting-mode/src/utterance/types";
import { env } from "../src/env";
import { startServer, stopServer } from "../src/server";

let redisPub: Redis;
let redisSub: Redis; // Tauri desktop IPC mock

mock.module("@larity/stt", () => {
  return {
    env: {
      DEEPGRAM_API_KEY: "test-key",
      REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
    },
    validateEnv: () => undefined,
    sessionManager: {
      createSession: mock(() => true),
      hasSession: mock(() => true),
      closeSession: mock(async () => undefined),
      closeAll: mock(async () => undefined),
      sendAudio: mock(async (sessionId: string, _frame: ArrayBuffer) => {
        // Publish mock STT final result
        const now = Date.now();
        const sttResult = {
          sessionId,
          transcript:
            "We absolutely must deliver this new feature by tomorrow.",
          speechTimestamp: now - 3000,
          ts: now,
          isFinal: true,
          diarizationIndex: 0,
          confidence: 0.99,
          channel: 0,
          start: 0,
          duration: 0.1,
        };
        await redisPub.publish(
          `meeting.stt.${sessionId}`,
          JSON.stringify(sttResult)
        );
      }),
    },
  };
});

// Create mocks for managers
const mockConstraintManager = {
  ensureHydrated: async () => {
    // mock
  },
  processUtterance: async () => {
    // mock
  },
  getAll: () => [],
  closeSessionAwaitSnapshots: async () => {
    // mock
  },
};

const mockCommitmentManager = {
  hydrateSession: async () => {
    // mock
  },
  addCommitment: async () => ({
    id: "commit-1",
    statement: "Deliver feature",
    normalizedStatement: "Deliver feature",
    speaker: {
      speakerId: "spk-1",
      name: "Alice",
      isCurrentUser: true,
      diarizationIndices: [0],
      type: "TEAM",
      confidence: 1,
    },
    topicId: "topic-1",
    type: "timeline" as const,
    status: "confirmed" as const,
    timestamp: Date.now(),
    utteranceId: "utt-1",
    embedding: [],
    relatedCommitments: [],
  }),
  search: () => [],
  getAll: () => [],
  closeSessionAwaitSnapshots: async () => {
    // mock
  },
};

import { redisKeys } from "@larity/infra/redis/keys";

function waitFor(predicate: () => boolean, timeoutMs = 2500): Promise<void> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      if (predicate()) {
        clearInterval(interval);
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(interval);
        reject(new Error("Timed out waiting for condition"));
      }
    }, 20);
  });
}

class DelegatingPipelineFinalizer {
  delegate: {
    getRecentSameSpeakerText(
      sessionId: string,
      speakerId: string,
      currentUtteranceId?: string,
      limit?: number
    ): string[];
    getRecentEmbeddings(sessionId: string, limit?: number): number[][];
    getRecentUtterancesChronological(
      sessionId: string,
      options?: { excludeUtteranceId?: string; limit?: number }
    ): Utterance[];
    applyTier2TopicDelta(
      sessionId: string,
      topicId: string | undefined,
      delta: { oldTopicId?: string; newTopicId?: string }
    ): Promise<void>;
  } | null = null;

  setDelegate(
    delegate: NonNullable<typeof this.delegate>
  ): void {
    this.delegate = delegate;
  }

  getRecentSameSpeakerText(
    sessionId: string,
    speakerId: string,
    currentUtteranceId?: string,
    limit?: number
  ): string[] {
    return this.delegate?.getRecentSameSpeakerText(sessionId, speakerId, currentUtteranceId, limit) ?? [];
  }

  getRecentEmbeddings(sessionId: string, limit?: number): number[][] {
    return this.delegate?.getRecentEmbeddings(sessionId, limit) ?? [];
  }

  getRecentUtterancesChronological(
    sessionId: string,
    options?: { excludeUtteranceId?: string; limit?: number }
  ): Utterance[] {
    return this.delegate?.getRecentUtterancesChronological(sessionId, options) ?? [];
  }

  async applyTier2TopicDelta(
    sessionId: string,
    topicId: string | undefined,
    delta: { oldTopicId?: string; newTopicId?: string }
  ): Promise<void> {
    await this.delegate?.applyTier2TopicDelta(sessionId, topicId, delta);
  }
}

describe("Full Pipeline E2E Test", () => {
  let app: ReturnType<typeof startServer> extends Promise<infer T> ? T : never;
  const receivedAlerts: any[] = [];

  beforeAll(async () => {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    redisPub = new Redis(redisUrl);
    redisSub = new Redis(redisUrl);

    await redisSub.subscribe(
      redisKeys.meetingAlertShared("test-session-e2e"),
      redisKeys.meetingAlertPersonal("test-session-e2e", "host-user")
    );
    redisSub.on("message", (channel, message) => {
      receivedAlerts.push({ channel, payload: JSON.parse(message) });
    });

    const delegatingFinalizer = new DelegatingPipelineFinalizer();

    const engine = new MeetingPipelineEngine({
      tier4Alerts: {
        publish: async (sessionId: string, alert: any) => {
          const pub = new AlertPublisher({
            redis: redisPub,
            sessionId,
          });
          await pub.publish(alert);
        },
      },
      preFilter: new PreFilter(),
      tier1: new Tier1StructuralDetector(),
      tier2: new Tier2Classifier({
        invoke: async () => ({
          text: JSON.stringify({
            intent: "commitment",
            commitmentType: "timeline",
            tone: "aggressive",
            riskSignals: ["tight_deadline"],
            extractedData: {},
            confidence: 0.95,
          }),
          promptTokens: 50,
          completionTokens: 30,
        }),
      }),
      tier4: new Tier4DeepReasoner({
        invoke: async () =>
          JSON.stringify({
            alertType: "pressure_detected",
            severity: "high",
            message: "Unrealistic timeline requested.",
            surfaceReason: "Tight deadline",
            suggestion: "Discuss feasibility.",
            confidence: 0.9,
            shouldSurface: true,
            routing: "shared",
            reasoning: "Tight deadline requested.",
          }),
      }),
      constraintManager: mockConstraintManager,
      commitmentManager: mockCommitmentManager,
      getContextPayload: async () => ({
        version: 1,
        sessionId: "test-session-e2e",
        meetingId: "meeting-1",
        clientId: "client-1",
        orgId: "org-1",
        loadedAt: Date.now(),
        openDecisions: [],
        knownConstraints: [],
        activePolicyGuardrails: [],
        priorCommitments: [],
        clientNameList: [],
        keywordBlocklists: [],
        calendarAgendaItems: [],
      }),
      getCurrentTopicLabel: async () => "General",
      finalizer: delegatingFinalizer,
    });

    const speakerManager = new SpeakerManager(redisPub);
    const finalizer = new UtteranceFinalizer(
      {
        publish: (channel, message) => redisPub.publish(channel, message),
        hset: (key, field, value) => redisPub.hset(key, field, value),
      },
      {
        topicManager: {
          enableAsyncSummarization: false,
        },
      }
    );

    delegatingFinalizer.setDelegate(finalizer);

    finalizer.onUtterancePublished((utterance) => {
      engine.evaluateUtteranceQueued(utterance, async () => {
        // Evaluate completion callback
      });
    });

    await startSubscriber(
      finalizer,
      speakerManager,
      redisPub,
      mockCommitmentManager as any,
      mockConstraintManager as any,
      engine
    );

    app = await startServer();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  afterAll(async () => {
    if (app) {
      stopServer(app);
    }
    stopSubscriber();
    await redisPub.quit();
    await redisSub.quit();
  });

  it("processes binary frames from WebSocket through full pipeline to Redis alerts channel", async () => {
    const ws = new WebSocket(
      `ws://127.0.0.1:${env.PORT}/?sessionId=test-session-e2e&userId=host-user&role=host`
    );

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("WebSocket open failed"));
    });

    // Send binary audio frame - mockSTT will intercept and publish STT result
    // STT result will be caught by subscriber, pushed through finalizer to MeetingPipelineEngine
    // Engine will run tier1, tier2, tier4, and publish an alert
    ws.send(new Uint8Array([1, 2, 3, 4]));

    await waitFor(() => receivedAlerts.length > 0);

    expect(receivedAlerts.length).toBeGreaterThan(0);
    const alert = receivedAlerts[0];
    expect(alert.channel).toBe(
      redisKeys.meetingAlertShared("test-session-e2e")
    );
    expect(alert.payload.category).toBe("pressure_detected");

    ws.close();
  });
});
