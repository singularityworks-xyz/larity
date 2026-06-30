import type { Tier2Classification } from "../pipeline/types";
import type { TopicState } from "../topic/types";
import type { Utterance } from "../utterance/types";
import { checkUndiscussedAgenda } from "./agenda-checker";
import { checkMissingClarity } from "./clarity-checker";
import { detectDisengagement } from "./engagement-detector";
import { analyzeToneTrajectory } from "./tone-analyzer";
import type {
  AgendaCheckInput,
  ClarityCheckInput,
  SpeakerState,
  SpeakerStateAlert,
  SpeakerStateSummary,
  SpeakerStateTrackerConfig,
} from "./types";
import { DEFAULT_SPEAKER_STATE_CONFIG } from "./types";

export class SpeakerStateTracker {
  private readonly sessions = new Map<string, Map<string, SpeakerState>>();
  private readonly config: SpeakerStateTrackerConfig;
  private readonly firedAlerts = new Set<string>();

  constructor(config?: Partial<SpeakerStateTrackerConfig>) {
    this.config = { ...DEFAULT_SPEAKER_STATE_CONFIG, ...config };
  }

  ingest(
    sessionId: string,
    utterance: Utterance,
    tier2Classification: Tier2Classification
  ): void {
    const sessionStates = this.getOrCreateSession(sessionId);
    const { speaker } = utterance;
    let state = sessionStates.get(speaker.speakerId);

    if (!state) {
      state = {
        speakerId: speaker.speakerId,
        speaker,
        toneHistory: [],
        avgResponseLength: utterance.wordCount,
        responseFrequency: 0,
        lastSpoke: utterance.timestamp,
        toneTrajectory: "stable",
        engagementLevel: "active",
        utteranceCount: 0,
        totalWords: 0,
        sessionStart: utterance.timestamp,
      };
      sessionStates.set(speaker.speakerId, state);
    }

    state.toneHistory.push({
      tone: tier2Classification.tone,
      timestamp: utterance.timestamp,
      utteranceId: utterance.utteranceId,
      wordCount: utterance.wordCount,
    });

    state.utteranceCount += 1;
    state.totalWords += utterance.wordCount;
    state.avgResponseLength = state.totalWords / state.utteranceCount;

    const sessionDurationMin =
      (utterance.timestamp - state.sessionStart) / 60_000;
    state.responseFrequency =
      sessionDurationMin > 0 ? state.utteranceCount / sessionDurationMin : 0;

    state.lastSpoke = utterance.timestamp;

    if (state.toneHistory.length > 200) {
      state.toneHistory = state.toneHistory.slice(-100);
    }

    const toneResult = analyzeToneTrajectory(state, this.config);
    state.toneTrajectory = toneResult.trajectory;

    const engagementResult = detectDisengagement(state, this.config);
    state.engagementLevel = engagementResult.level;
  }

  checkAlerts(
    sessionId: string,
    utterance: Utterance,
    tier2Classification: Tier2Classification,
    topics: TopicState[],
    agendaItems: string[],
    isMeetingEnd: boolean
  ): SpeakerStateAlert[] {
    const alerts: SpeakerStateAlert[] = [];
    const sessionStates = this.sessions.get(sessionId);
    if (!sessionStates) {
      return alerts;
    }

    const state = sessionStates.get(utterance.speaker.speakerId);
    if (state) {
      this.collectSpeakerAlerts(state, alerts);
    }

    this.collectClarityAlert(tier2Classification, topics, utterance, alerts);

    if (isMeetingEnd) {
      this.collectAgendaAlert(topics, agendaItems, alerts);
    }

    return alerts;
  }

  private collectSpeakerAlerts(
    state: SpeakerState,
    alerts: SpeakerStateAlert[]
  ): void {
    const toneResult = analyzeToneTrajectory(state, this.config);
    if (toneResult.alert) {
      const dedupeKey = `tone_warning:${state.speakerId}`;
      if (!this.firedAlerts.has(dedupeKey)) {
        alerts.push(toneResult.alert);
        this.firedAlerts.add(dedupeKey);
      }
    }

    const engagementResult = detectDisengagement(state, this.config);
    if (engagementResult.alert) {
      const dedupeKey = `client_disengagement:${state.speakerId}:${engagementResult.level}`;
      if (!this.firedAlerts.has(dedupeKey)) {
        alerts.push(engagementResult.alert);
        this.firedAlerts.add(dedupeKey);
      }
    }
  }

  private collectClarityAlert(
    tier2Classification: Tier2Classification,
    topics: TopicState[],
    utterance: Utterance,
    alerts: SpeakerStateAlert[]
  ): void {
    const isTopicShift =
      tier2Classification.topicDelta?.labelHint !== undefined;
    if (!isTopicShift || topics.length < 2) {
      return;
    }

    const prevTopic = topics.at(-2);
    if (!prevTopic) {
      return;
    }
    const clarityInput: ClarityCheckInput = {
      prevTopicId: prevTopic.topicId,
      prevTopicCompleteness: prevTopic.completeness,
      prevTopicUtteranceCount: prevTopic.utteranceCount,
      currentTopicId: utterance.topicId,
      isTopicShift: true,
    };
    const clarityAlert = checkMissingClarity(clarityInput, this.config);
    if (clarityAlert) {
      const dedupeKey = `missing_clarity:${prevTopic.topicId}`;
      if (!this.firedAlerts.has(dedupeKey)) {
        alerts.push(clarityAlert);
        this.firedAlerts.add(dedupeKey);
      }
    }
  }

  private collectAgendaAlert(
    topics: TopicState[],
    agendaItems: string[],
    alerts: SpeakerStateAlert[]
  ): void {
    if (agendaItems.length === 0) {
      return;
    }

    const discussedLabels = topics.map((t) => t.label);
    const agendaInput: AgendaCheckInput = {
      discussedTopicLabels: discussedLabels,
      agendaItems,
    };
    const agendaAlert = checkUndiscussedAgenda(agendaInput, this.config);
    if (agendaAlert) {
      const dedupeKey = "undiscussed_agenda:meeting_end";
      if (!this.firedAlerts.has(dedupeKey)) {
        alerts.push(agendaAlert);
        this.firedAlerts.add(dedupeKey);
      }
    }
  }

  getSpeakerState(
    sessionId: string,
    speakerId: string
  ): SpeakerState | undefined {
    return this.sessions.get(sessionId)?.get(speakerId);
  }

  getAllStates(sessionId: string): SpeakerState[] {
    const sessionStates = this.sessions.get(sessionId);
    if (!sessionStates) {
      return [];
    }
    return [...sessionStates.values()];
  }

  getSummaries(sessionId: string): SpeakerStateSummary[] {
    return this.getAllStates(sessionId).map((state) => ({
      speakerId: state.speakerId,
      name: state.speaker.name,
      type: state.speaker.type,
      toneTrajectory: state.toneTrajectory,
      engagementLevel: state.engagementLevel,
      avgResponseLength: state.avgResponseLength,
      responseFrequency: state.responseFrequency,
      recentTone:
        state.toneHistory.length > 0
          ? (state.toneHistory.at(-1)?.tone ?? "neutral")
          : "neutral",
    }));
  }

  closeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  closeAll(): void {
    this.sessions.clear();
    this.firedAlerts.clear();
  }

  private getOrCreateSession(sessionId: string): Map<string, SpeakerState> {
    let sessionStates = this.sessions.get(sessionId);
    if (!sessionStates) {
      sessionStates = new Map();
      this.sessions.set(sessionId, sessionStates);
    }
    return sessionStates;
  }
}
