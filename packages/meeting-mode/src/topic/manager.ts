import { topicChannel } from "../channels";
import { createMeetingModeLogger } from "../logger";
import type { Tier2TopicDelta } from "../pipeline/types";
import type { Utterance } from "../utterance/types";
import { GoogleGenAIEmbedder } from "./embedder";
import { cosineSimilarity, updateCentroid } from "./similarity";
import { TopicSummarizer } from "./summarizer";
import type { TopicState } from "./types";

const log = createMeetingModeLogger("topic-manager");

/** Derive a short initial label from the first utterance text so the
 *  frontend shows something descriptive before the summarizer or Tier 2
 *  supplies the real label. */
function deriveInitialLabel(text?: string): string {
  if (!text) {
    return "New Topic";
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return "New Topic";
  }
  const maxLen = 40;
  if (trimmed.length <= maxLen) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLen)}…`;
}

export interface TopicPublisher {
  publish(channel: string, message: string): Promise<number>;
  hset(key: string, field: string, value: string): Promise<number>;
}

export interface TopicManagerOptions {
  enableAsyncSummarization?: boolean;
}

export class TopicManager {
  private readonly embedder: GoogleGenAIEmbedder;
  private readonly summarizer: TopicSummarizer;
  private readonly publisher: TopicPublisher;
  private readonly enableAsyncSummarization: boolean;

  // similarity threshold for assigning to an existing topic
  private readonly SIMILARITY_THRESHOLD = 0.65;

  // Debounce settings for slow path
  private readonly BATCH_THRESHOLD = 4;
  private readonly SILENCE_TIMEOUT_MS = 5000;

  // In-memory state: sessionId -> TopicState[]
  private readonly activeTopics = new Map<string, TopicState[]>();

  // Pending utterances per topicId: topicId -> string[]
  private readonly pendingUtterances = new Map<string, string[]>();

  // Timers for silence debouncing per topic
  private readonly debounceTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  // Processing locks per topic to prevent concurrent summarizer runs
  private readonly processingLocks = new Set<string>();

  // Tracks last summarization hash per topic to skip redundant LLM calls
  private readonly lastSummarizedHash = new Map<string, string>();

  constructor(publisher: TopicPublisher, options: TopicManagerOptions = {}) {
    this.embedder = new GoogleGenAIEmbedder();
    this.summarizer = new TopicSummarizer();
    this.publisher = publisher;
    this.enableAsyncSummarization = options.enableAsyncSummarization ?? true;
  }

  /**
   * Fast Path: Embed the incoming utterance, find a matching topic (or spawn new),
   * update the centroid in memory, and return the assigned topicId.
   */
  async assignTopic(utterance: Utterance): Promise<string> {
    const { sessionId, text } = utterance;

    // 1. Embed utterance (pre-computed, in-flight promise, or embed here)
    let newVector: number[] = [];
    if (utterance.embedding && utterance.embedding.length > 0) {
      newVector = utterance.embedding;
    } else if (utterance.embeddingPromise) {
      try {
        const resolved = await utterance.embeddingPromise;
        newVector =
          resolved && resolved.length > 0
            ? resolved
            : await this.embedder.embed(text).catch(() => []);
      } catch {
        newVector = await this.embedder.embed(text).catch(() => []);
      }
    } else {
      newVector = await this.embedder.embed(text).catch(() => []);
    }
    utterance.embedding = newVector;

    // 2. Find best match
    const sessionTopics = this.activeTopics.get(sessionId) || [];
    let bestTopic: TopicState | null = null;
    let maxSimilarity = -1;

    if (newVector.length > 0) {
      for (const topic of sessionTopics) {
        if (!topic.centroid || topic.centroid.length === 0) {
          continue;
        }
        const sim = cosineSimilarity(topic.centroid, newVector);
        if (sim > maxSimilarity) {
          maxSimilarity = sim;
          bestTopic = topic;
        }
      }
    }

    let assignedTopicId: string;

    // 3. Assign or Create
    if (bestTopic && maxSimilarity >= this.SIMILARITY_THRESHOLD) {
      assignedTopicId = bestTopic.topicId;
      // Update centroid
      bestTopic.centroid = updateCentroid(
        bestTopic.centroid,
        newVector,
        bestTopic.utteranceCount
      );
      bestTopic.utteranceCount += 1;
      log.info(
        { sessionId, topicId: assignedTopicId, similarity: maxSimilarity },
        "Assigned utterance to existing topic"
      );
    } else if (newVector.length === 0 && sessionTopics.length > 0) {
      // Fallback: assign to the most recently active topic when embeddings fail
      const fallbackTopic = sessionTopics[sessionTopics.length - 1] as TopicState;
      assignedTopicId = fallbackTopic.topicId;
      fallbackTopic.utteranceCount += 1;
      log.warn(
        { sessionId, topicId: assignedTopicId },
        "Embedding failed, assigned utterance to fallback topic"
      );
    } else {
      assignedTopicId = this.generateTopicId(sessionId);

      const newTopic: TopicState = this.createNewTopicState(
        assignedTopicId,
        newVector,
        text
      );
      sessionTopics.push(newTopic);
      this.activeTopics.set(sessionId, sessionTopics);

      log.info({ sessionId, topicId: assignedTopicId }, "Spawned new topic");

      this.persistAndPublish(sessionId, newTopic).catch((err) =>
        log.error(
          { err, sessionId, topicId: assignedTopicId },
          "Failed to publish new topic"
        )
      );
    }

    if (this.enableAsyncSummarization) {
      this.enqueueForSummarization(assignedTopicId, text);
    }

    return assignedTopicId;
  }

  async applyTier2TopicDelta(
    sessionId: string,
    topicId: string,
    delta: Tier2TopicDelta
  ): Promise<void> {
    const topics = this.activeTopics.get(sessionId) || [];
    const topic = topics.find((item) => item.topicId === topicId);

    if (!topic) {
      return;
    }

    const summarySegments: string[] = [];

    if (delta.labelHint) {
      topic.label = delta.labelHint;
    }

    if (delta.decision) {
      summarySegments.push(`Decision: ${delta.decision}`);
    }

    if (delta.commitment) {
      topic.commitmentsMentioned = appendUniqueByDescription(
        topic.commitmentsMentioned,
        {
          id: `commitment_${Date.now()}`,
          description: delta.commitment,
          owner: delta.owner,
          dueDate: delta.deadline,
        }
      );
      summarySegments.push(`Commitment: ${delta.commitment}`);
    }

    if (delta.risk) {
      topic.riskFlags = appendUniqueRisk(topic.riskFlags, {
        id: `risk_${Date.now()}`,
        description: delta.risk,
        severity: "medium",
      });
      summarySegments.push(`Risk: ${delta.risk}`);
    }

    if (delta.openQuestion) {
      topic.completeness.hasActionItems = true;
      if (!topic.completeness.actionItems.includes(delta.openQuestion)) {
        topic.completeness.actionItems.push(delta.openQuestion);
      }
      summarySegments.push(`Open question: ${delta.openQuestion}`);
    }

    if (delta.owner) {
      topic.completeness.hasOwner = true;
      topic.completeness.ownerName = delta.owner;
    }

    if (delta.deadline) {
      topic.completeness.hasDeadline = true;
      topic.completeness.deadline = delta.deadline;
    }

    if (summarySegments.length > 0) {
      topic.summary = mergeSummarySegments(topic.summary, summarySegments);
    }

    topic.lastUpdated = Date.now();
    await this.persistAndPublish(sessionId, topic);
  }

  /**
   * Slow Path orchestration: Add text to pending queue, check triggers.
   * LLM summarization is strictly a background polish step — the live summary
   * comes from applyTier2TopicDelta reducer state.
   */
  private enqueueForSummarization(topicId: string, text: string): void {
    const pending = this.pendingUtterances.get(topicId) || [];
    pending.push(text);
    this.pendingUtterances.set(topicId, pending);

    // Clear existing timer
    const existingTimer = this.debounceTimers.get(topicId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Hash-based dedup: skip LLM if topic state hasn't changed significantly
    const topicState = this.findTopicState(topicId);
    const currentHash = topicState ? computeStateHash(topicState) : "";
    const lastHash = this.lastSummarizedHash.get(topicId);

    if (lastHash && currentHash === lastHash) {
      log.debug(
        { topicId },
        "Skipping summarization — no meaningful state change"
      );
      this.pendingUtterances.set(topicId, []);
      return;
    }

    // Trigger 1: Batch size reached
    if (pending.length >= this.BATCH_THRESHOLD) {
      // Intentionally not awaiting here to keep caller fast
      this.triggerSummarization(topicId).catch((err) =>
        log.error({ err }, "Background summarization failed")
      );
      return;
    }

    // Trigger 2: Silence Debounce
    const timer = setTimeout(() => {
      this.triggerSummarization(topicId).catch((err) =>
        log.error({ err }, "Background summarization failed")
      );
    }, this.SILENCE_TIMEOUT_MS);
    this.debounceTimers.set(topicId, timer);
  }

  private findTopicState(topicId: string): TopicState | null {
    for (const topics of this.activeTopics.values()) {
      const t = topics.find((topic) => topic.topicId === topicId);
      if (t) {
        return t;
      }
    }
    return null;
  }

  /**
   * Trigger the actual LLM summarization. Contains locking logic to avoid race conditions.
   * Rely entirely on applyTier2TopicDelta (the reducer state) as the live summary;
   * LLM refinement is strictly a background polish step — fail-silent without re-queueing.
   */
  private async triggerSummarization(topicId: string): Promise<void> {
    if (this.processingLocks.has(topicId)) {
      return;
    }

    const pending = this.pendingUtterances.get(topicId) || [];
    if (pending.length === 0) {
      return;
    }

    this.processingLocks.add(topicId);

    const utterancesToSummarize = [...pending];
    this.pendingUtterances.set(topicId, []);

    let success = false;

    try {
      const targetTopic = this.findTopicState(topicId);
      let targetSessionId = "";

      for (const [sessionId, topics] of this.activeTopics.entries()) {
        if (topics.some((t) => t.topicId === topicId)) {
          targetSessionId = sessionId;
          break;
        }
      }

      if (!targetTopic) {
        log.warn({ topicId }, "Topic state not found during summarization");
        return;
      }

      log.debug(
        { topicId, count: utterancesToSummarize.length },
        "Triggering LLM summarizer"
      );

      const partialState = await this.summarizer.summarize(
        targetTopic,
        utterancesToSummarize
      );

      this.applySummarizerUpdate(targetTopic, partialState);
      await this.persistAndPublish(targetSessionId, targetTopic);
      success = true;

      this.lastSummarizedHash.set(topicId, computeStateHash(targetTopic));
    } catch (error) {
      // Fail-silent: strictly catch all LLM errors without breaking TopicManager.
      // applyTier2TopicDelta is the live source of truth; LLM polish is best-effort.
      log.warn(
        { err: error, topicId },
        "Background summarization LLM failed silently"
      );
    } finally {
      this.processingLocks.delete(topicId);
    }

    if (success) {
      log.debug({ topicId }, "Background summarization completed successfully");
    }
  }

  private applySummarizerUpdate(
    target: TopicState,
    partial: Partial<TopicState>
  ): void {
    target.lastUpdated = Date.now();
    if (partial.label) {
      target.label = partial.label;
    }
    if (partial.summary) {
      target.summary = partial.summary;
    }
    if (partial.constraintsMentioned) {
      target.constraintsMentioned = partial.constraintsMentioned;
    }
    if (partial.commitmentsMentioned) {
      target.commitmentsMentioned = partial.commitmentsMentioned;
    }
    if (partial.riskFlags) {
      target.riskFlags = partial.riskFlags;
    }
    if (partial.completeness) {
      target.completeness = { ...target.completeness, ...partial.completeness };
    }
  }

  private async persistAndPublish(
    sessionId: string,
    topic: TopicState
  ): Promise<void> {
    try {
      const topicJson = JSON.stringify(topic);
      const redisKey = `meeting.topics.${sessionId}`;

      // Save full topic state to HASH
      await this.publisher.hset(redisKey, topic.topicId, topicJson);

      // Broadcast update to clients
      await this.publisher.publish(topicChannel(sessionId), topicJson);

      log.info(
        { sessionId, topicId: topic.topicId },
        "Topic state updated and published"
      );
    } catch (error) {
      log.error(
        { err: error, sessionId, topicId: topic.topicId },
        "Failed to persist/publish topic state"
      );
    }
  }

  private generateTopicId(sessionId: string): string {
    return `topic_${sessionId}_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 7)}`;
  }

  private createNewTopicState(
    topicId: string,
    initialCentroid: number[],
    initialText?: string
  ): TopicState {
    const derivedLabel = deriveInitialLabel(initialText);
    return {
      topicId,
      label: derivedLabel,
      summary: "",
      constraintsMentioned: [],
      commitmentsMentioned: [],
      riskFlags: [],
      centroid: initialCentroid,
      utteranceCount: 1,
      lastUpdated: Date.now(),
      completeness: {
        hasOwner: false,
        hasDeadline: false,
        hasActionItems: false,
        actionItems: [],
        hasExplicitConfirmation: false,
      },
    };
  }

  async closeSession(sessionId: string): Promise<void> {
    const topics = this.activeTopics.get(sessionId) || [];
    for (const topic of topics) {
      const timer = this.debounceTimers.get(topic.topicId);
      if (timer) {
        clearTimeout(timer);
      }
      this.debounceTimers.delete(topic.topicId);

      if (
        this.enableAsyncSummarization &&
        !this.processingLocks.has(topic.topicId)
      ) {
        await this.triggerSummarization(topic.topicId);
      }
      this.pendingUtterances.delete(topic.topicId);
      this.lastSummarizedHash.delete(topic.topicId);
    }
    this.activeTopics.delete(sessionId);
    log.info({ sessionId }, "Topic manager session closed");
  }

  getTopics(sessionId: string): TopicState[] {
    return [...(this.activeTopics.get(sessionId) ?? [])];
  }
}

function computeStateHash(state: TopicState): string {
  const parts = [
    state.label,
    state.summary,
    String(state.commitmentsMentioned.length),
    String(state.riskFlags.length),
    String(state.completeness.hasOwner),
    String(state.completeness.hasDeadline),
  ];
  return parts.join("|");
}

function appendUniqueByDescription<T extends { description: string }>(
  items: T[],
  next: T
): T[] {
  if (items.some((item) => item.description === next.description)) {
    return items;
  }

  return [...items, next];
}

function appendUniqueRisk(
  current: TopicState["riskFlags"],
  risk: TopicState["riskFlags"][number]
): TopicState["riskFlags"] {
  if (current.some((item) => item.description === risk.description)) {
    return current;
  }

  return [...current, risk];
}

function mergeSummarySegments(previous: string, segments: string[]): string {
  const existing = previous.trim();
  const addition = segments.join(" ").trim();
  if (!existing) {
    return addition;
  }
  if (!addition) {
    return existing;
  }
  return `${existing} ${addition}`.trim();
}
