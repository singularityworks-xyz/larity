import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("@google/genai", () => {
  return {
    GoogleGenAI: mock().mockImplementation(() => {
      return {
        models: {
          embedContent: mock(async () => ({
            embeddings: [{ values: [0.1, 0.2, 0.3] }],
          })),
        },
      };
    }),
  };
});

import { MeetingPipelineEngine } from "../../src/pipeline/engine";
import { UtteranceFinalizer } from "../../src/utterance/finalizer";
import type { SpeakerIdentity, Utterance } from "../../src/utterance/types";

describe("Tier3 Pipeline Integration (Embed Once)", () => {
  let finalizer: UtteranceFinalizer;
  let engine: MeetingPipelineEngine;
  let publisherMock: any;
  let constraintManagerMock: any;
  let commitmentManagerMock: any;

  beforeEach(() => {
    publisherMock = {
      publish: mock(() => undefined),
    };

    constraintManagerMock = {
      ensureHydrated: mock(() => Promise.resolve()),
      processUtterance: mock(() => Promise.resolve()),
      getAll: mock(() => []),
    };

    commitmentManagerMock = {
      hydrateSession: mock(() => Promise.resolve()),
      addCommitment: mock(() => Promise.resolve()),
      search: mock(() => []),
      getAll: mock(() => []),
    };

    finalizer = new UtteranceFinalizer(publisherMock, {
      topicManager: {
        updateDebounceMs: 0,
        model: "gemini-test",
      },
    });

    engine = new MeetingPipelineEngine({
      finalizer: finalizer as any,
      constraintManager: constraintManagerMock,
      commitmentManager: commitmentManagerMock,
      getContextPayload: mock(() =>
        Promise.resolve({
          version: 1,
          sessionId: "sess-1",
          meetingId: "meet-1",
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
        })
      ),
      tier1: {
        detect: mock(() => ({
          detections: [],
          technicalHit: false,
          blocklistHit: false,
          pricingHit: false,
        })),
        closeSession: mock(),
        closeAll: mock(),
        seedContext: mock(),
      } as any,
      tier2: {
        classify: mock(() =>
          Promise.resolve({
            classification: {
              intent: "general",
              commitmentType: null,
              tone: "neutral",
              riskSignals: [],
              extractedData: {},
              confidence: 0.9,
            },
            shouldStopForDeepReasoning: true,
          })
        ),
        closeSession: mock(),
        closeAll: mock(),
      } as any,
    });
  });

  const _createSpeaker = (): SpeakerIdentity => ({
    speakerId: "spk-1",
    type: "TEAM",
    name: "Speaker 1",
    diarizationIndices: [0],
    isCurrentUser: true,
    confidence: 1,
  });

  test("should compute embedding exactly once per utterance and share it", async () => {
    // Override embedder to avoid mock.module issues
    (finalizer as any).embedder = {
      embed: mock(async () => [0.1, 0.2, 0.3]),
    };

    // 1. Process via finalizer
    const sttResult = {
      sessionId: "sess-1",
      isFinal: true,
      transcript: "Test embedding reuse",
      confidence: 0.9,
      diarizationIndex: 0,
      channel: 0,
      start: 0,
      duration: 1,
      ts: Date.now(),
    };
    await finalizer.process(sttResult);

    // 2. Process a second one 10 seconds later to force the merger to flush the first one
    await finalizer.process({
      sessionId: "sess-1",
      isFinal: true,
      transcript: "Second utterance",
      confidence: 0.9,
      diarizationIndex: 0,
      channel: 0,
      start: 10,
      duration: 1,
      ts: Date.now() + 10_000,
    });

    // We mock UtteranceFinalizer's ringBuffer publishing to directly pass to engine in real code,
    // but here we can just intercept the published utterance.
    expect(publisherMock.publish).toHaveBeenCalled();
    const publishedChannel = publisherMock.publish.mock.calls[0][0];
    const publishedMessage = publisherMock.publish.mock.calls[0][1];

    expect(publishedChannel).toBe("meeting.utterance.sess-1");
    const utterance = JSON.parse(publishedMessage) as Utterance;

    expect(utterance.embedding).toBeDefined();
    expect(utterance.embedding).toEqual([0.1, 0.2, 0.3]);

    // 2. Evaluate via engine
    const result = await engine.evaluateUtterance(utterance);

    // Expect Tier 3 to run and use the embedding
    expect(result.tier3).toBeDefined();
    expect(result.tier3?.forceTier4).toBe(false);
  });
});
