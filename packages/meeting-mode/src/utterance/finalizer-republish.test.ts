import { describe, expect, test } from "bun:test";
import type { SttResult } from "../../../stt/src/types";
import type { UtterancePublishOptions } from "./finalizer";
import { UtteranceFinalizer } from "./finalizer";

const finalizerDependencies = {
  embedder: { embed: () => Promise.resolve([0.1, 0.2]) },
  topicManager: {
    applyTier2TopicDelta: () => Promise.resolve(),
    assignTopic: () => Promise.resolve("topic-1"),
    closeSession: () => Promise.resolve(),
    getTopics: () => [],
  },
};

function makeFinal(diarizationIndex: number, text: string): SttResult {
  return {
    channel: 1,
    confidence: 0.9,
    diarizationIndex,
    duration: 1,
    isFinal: true,
    sessionId: "test-session",
    speechTimestamp: Date.now() - 500,
    start: 0,
    transcript: text,
    ts: Date.now() - 400,
    type: "stt_final",
  };
}

describe("UtteranceFinalizer retroactive republish (P2.4)", () => {
  test("re-identification republishes with a reason instead of a fresh publish", async () => {
    const seen: Array<{ options?: UtterancePublishOptions; id: string }> = [];
    const finalizer = new UtteranceFinalizer(
      {
        hset: () => Promise.resolve(0),
        publish: () => Promise.resolve(1),
      },
      { dependencies: finalizerDependencies }
    );
    finalizer.onUtterancePublished((utterance, options) => {
      seen.push({ id: utterance.utteranceId, options });
      return Promise.resolve();
    });

    // Diarization index 5 with no identifier: EXTERNAL spk_5. A second,
    // different-speaker final forces the first out of the merger.
    await finalizer.process(makeFinal(5, "client says we agree today"));
    await finalizer.process(makeFinal(6, "host replies with thanks now"));
    expect(seen).toEqual([{ id: "test-session:0", options: undefined }]);

    // Late VAD correlation identifies the speaker as a team member.
    await finalizer.processRetroactiveIdentification("test-session", 5, {
      confidence: 0.9,
      diarizationIndices: [1005],
      isCurrentUser: false,
      name: "Ada",
      speakerId: "spk_5",
      type: "TEAM",
      userId: "u1",
    });

    // Same utterance id, flagged as a republish: the index.ts handler uses
    // the flag to replace the cached entry instead of re-running the pipeline.
    expect(seen).toEqual([
      { id: "test-session:0", options: undefined },
      { id: "test-session:0", options: { republish: "reidentified" } },
    ]);
  });

  test("manual role change republishes with a role_change reason", async () => {
    const seen: Array<{ options?: UtterancePublishOptions; id: string }> = [];
    const finalizer = new UtteranceFinalizer(
      {
        hset: () => Promise.resolve(0),
        publish: () => Promise.resolve(1),
      },
      { dependencies: finalizerDependencies }
    );
    finalizer.onUtterancePublished((utterance, options) => {
      seen.push({ id: utterance.utteranceId, options });
      return Promise.resolve();
    });

    await finalizer.process(makeFinal(5, "client says we agree today"));
    await finalizer.process(makeFinal(6, "host replies with thanks now"));
    await finalizer.processRetroactiveRoleChange("test-session", "spk_5", {
      confidence: 1,
      diarizationIndices: [5],
      isCurrentUser: false,
      name: "Speaker 6",
      speakerId: "spk_5",
      type: "TEAM",
      userId: "u9",
    });

    expect(seen.map((s) => s.options)).toEqual([
      undefined,
      { republish: "role_change" },
    ]);
  });
});
