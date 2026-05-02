import { topicChannel } from "../channels";
import { createMeetingModeLogger } from "../logger";
import type { Tier2TopicDelta } from "../pipeline/types";
import type { Utterance } from "../utterance/types";
import { GoogleGenAIEmbedder } from "./embedder";
import { cosineSimilarity, updateCentroid } from "./similarity";
import { TopicSummarizer } from "./summarizer";
import type { TopicState } from "./types";

const log = createMeetingModeLogger("topic-manager");

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

    // 1. Embed utterance (use pre-computed if available)
    const newVector = utterance.embedding ?? (await this.embedder.embed(text));
    utterance.embedding = newVector;

    // 2. Find best match
    const sessionTopics = this.activeTopics.get(sessionId) || [];
    let bestTopic: TopicState | null = null;
    let maxSimilarity = -1;

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
    } else {
      assignedTopicId = this.generateTopicId(sessionId);

      const newTopic: TopicState = this.createNewTopicState(
        assignedTopicId,
        newVector
      );
      sessionTopics.push(newTopic);
      this.activeTopics.set(sessionId, sessionTopics);

      log.info({ sessionId, topicId: assignedTopicId }, "Spawned new topic");
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

  /**
   * Trigger the actual LLM summarization. Contains locking logic to avoid race conditions.
   */
  private async triggerSummarization(topicId: string): Promise<void> {
    if (this.processingLocks.has(topicId)) {
      // Currently summarizing. The next batch/debounce will pick up any remaining items later.
      return;
    }

    const pending = this.pendingUtterances.get(topicId) || [];
    if (pending.length === 0) {
      return;
    }

    this.processingLocks.add(topicId);

    // Snapshot the batch and clear the pending list
    const utterancesToSummarize = [...pending];
    this.pendingUtterances.set(topicId, []);

    try {
      // Find the topic state
      let targetTopic: TopicState | null = null;
      let targetSessionId = "";

      for (const [sessionId, topics] of this.activeTopics.entries()) {
        const t = topics.find((topic) => topic.topicId === topicId);
        if (t) {
          targetTopic = t;
          targetSessionId = sessionId;
          break;
        }
      }

      if (!targetTopic) {
        log.warn(
          { topicId },
          "Topic state not found during summarization trigger"
        );
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

      // Merge new data
      this.applySummarizerUpdate(targetTopic, partialState);

      // Persist to Redis and Publish
      await this.persistAndPublish(targetSessionId, targetTopic);
    } catch (error) {
      log.error({ err: error, topicId }, "Summarization workflow failed");
      // Put them back in queue (prepend) to try again next time
      const currentPending = this.pendingUtterances.get(topicId) || [];
      this.pendingUtterances.set(topicId, [
        ...utterancesToSummarize,
        ...currentPending,
      ]);
    } finally {
      this.processingLocks.delete(topicId);
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
    initialCentroid: number[]
  ): TopicState {
    return {
      topicId,
      label: "New Topic", // Temporary until LLM updates it
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
    }
    this.activeTopics.delete(sessionId);
    log.info({ sessionId }, "Topic manager session closed");
  }

  getTopics(sessionId: string): TopicState[] {
    return [...(this.activeTopics.get(sessionId) ?? [])];
  }
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
