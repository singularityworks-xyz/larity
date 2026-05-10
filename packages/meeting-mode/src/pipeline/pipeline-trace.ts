import { pipelineTraceChannel } from "../channels";
import { PIPELINE_TRACE_PRETTY_JSON } from "../env";
import { createMeetingModeLogger } from "../logger";
import type { Utterance } from "../utterance/types";
import type { PipelineEvaluationResult } from "./engine";
import type {
  Tier1Result,
  Tier2Classification,
  Tier3Result,
  Tier4Response,
} from "./types";

export const PIPELINE_TRACE_VERSION = 1 as const;

/** Safe for Redis + desktop logs — no embeddings or internal `reasoning`; surfaced copy is user-visible UI text */
export interface PipelineTracePayload {
  v: typeof PIPELINE_TRACE_VERSION;
  sessionId: string;
  utteranceId: string;
  timestamp: number;
  textPreview: string;
  dropped: boolean;
  dropReason?: string;
  tier1?: Pick<Tier1Result, "technicalHit" | "blocklistHit" | "pricingHit">;
  tier2?: Pick<Tier2Classification, "intent" | "confidence"> & {
    riskSignalCount: number;
    stopDeepReason: boolean;
  };
  tier3?: Pick<Tier3Result, "forceTier4" | "noveltyScore"> & {
    memoryMatchCount: number;
    ledgerMatchCount: number;
  };
  gate?: {
    runTier4: boolean;
    highSignalEstimate: boolean;
  };
  tier4?: {
    invoked: boolean;
    surfaced?: boolean;
    ms?: number;
    alertType?: string;
    severity?: string;
    message?: string;
    surfaceReason?: string;
    suggestion?: string;
  };
  latencyMs?: {
    tier2?: number;
    gate?: number;
    tier4?: number;
    total?: number;
  };
  terminalLine: string;
}

const traceLog = createMeetingModeLogger("pipeline-trace");

function textPreviewSnippet(text: string, maxChars: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= maxChars
    ? oneLine
    : `${oneLine.slice(0, maxChars - 1)}…`;
}

function computeHighSignal(
  tier1: Tier1Result | undefined,
  tier2: Tier2Classification | undefined
): boolean {
  if (!(tier1 && tier2)) {
    return false;
  }
  return (
    tier1.blocklistHit ||
    tier1.technicalHit ||
    tier1.pricingHit ||
    tier2.intent === "commitment" ||
    tier2.intent === "decision" ||
    tier2.intent === "concern" ||
    tier2.riskSignals.length > 0
  );
}

function shortUtteranceId(id: string): string {
  return id.length <= 8 ? id : id.slice(0, 8);
}

type Tier4TraceSnap = NonNullable<PipelineTracePayload["tier4"]>;

function traceTier4SurfacedCopy(
  t4Rsp: Tier4Response
):
  | Pick<Tier4TraceSnap, "message" | "surfaceReason" | "suggestion">
  | undefined {
  const message = typeof t4Rsp.message === "string" ? t4Rsp.message.trim() : "";
  if (!message) {
    return undefined;
  }

  const out: Pick<Tier4TraceSnap, "message" | "surfaceReason" | "suggestion"> =
    { message };

  const sr =
    typeof t4Rsp.surfaceReason === "string" ? t4Rsp.surfaceReason.trim() : "";
  if (sr.length > 0) {
    out.surfaceReason = sr;
  }

  const sug =
    typeof t4Rsp.suggestion === "string" ? t4Rsp.suggestion.trim() : "";
  if (sug.length > 0) {
    out.suggestion = sug;
  }

  return out;
}

function assembleTier4Trace(result: PipelineEvaluationResult): Tier4TraceSnap {
  const t4Outcome = result.tier4Outcome;
  const t4Rsp = result.tier4Response;

  const base: Tier4TraceSnap = {
    invoked: t4Outcome?.invoked ?? false,
    surfaced: t4Outcome?.surfaced,
    ms:
      typeof t4Outcome?.latencyMs === "number"
        ? Math.round(t4Outcome.latencyMs)
        : undefined,
    alertType:
      typeof t4Rsp?.alertType === "string" ? t4Rsp.alertType : undefined,
    severity: typeof t4Rsp?.severity === "string" ? t4Rsp.severity : undefined,
  };

  const surfacedOk =
    t4Outcome?.surfaced === true &&
    t4Rsp !== null &&
    t4Rsp !== undefined &&
    t4Rsp.alertType !== "none";

  if (!surfacedOk) {
    return base;
  }

  const copy = traceTier4SurfacedCopy(t4Rsp);
  return copy === undefined ? base : { ...base, ...copy };
}

function formatTier4Brief(
  runTier4: boolean,
  tier4Trace: Tier4TraceSnap
): string {
  if (!runTier4) {
    return "T4(skipped)";
  }
  if (!tier4Trace.invoked) {
    return "T4(no-result)";
  }
  if (tier4Trace.surfaced === true && tier4Trace.alertType) {
    return `T4(surf:${tier4Trace.alertType}:${tier4Trace.ms ?? "?"}ms)`;
  }
  if (tier4Trace.surfaced === false) {
    return `T4(abstain:${tier4Trace.alertType ?? "—"}:${tier4Trace.ms ?? "?"}ms)`;
  }
  return `T4(inv:${tier4Trace.ms ?? "?"}ms)`;
}

function latencySnapshotFromResult(result: PipelineEvaluationResult) {
  return {
    tier2: result.latencies.tier2Ms,
    gate: result.latencies.gateMs,
    tier4:
      typeof result.latencies.tier4Ms === "number"
        ? Math.round(result.latencies.tier4Ms)
        : undefined,
    total:
      typeof result.latencies.pipelineBudgetMs === "number"
        ? Math.round(result.latencies.pipelineBudgetMs)
        : undefined,
  };
}

function buildDroppedTracePayload(
  utterance: Utterance,
  textPreview: string,
  result: PipelineEvaluationResult
): PipelineTracePayload {
  return {
    v: PIPELINE_TRACE_VERSION,
    sessionId: utterance.sessionId,
    utteranceId: utterance.utteranceId,
    timestamp: utterance.timestamp,
    textPreview,
    dropped: true,
    dropReason: result.dropReason ?? "filtered",
    latencyMs: {
      total: result.latencies.pipelineBudgetMs,
    },
    terminalLine: `[pipeline] dropped=${result.dropReason ?? "filtered"} utt=${shortUtteranceId(utterance.utteranceId)} text="${textPreview}"`,
  };
}

export function buildPipelineTracePayload(
  utterance: Utterance,
  result: PipelineEvaluationResult,
  previewChars = 100
): PipelineTracePayload {
  const textPreview = textPreviewSnippet(utterance.text, previewChars);

  if (result.dropped || !result.tier1 || !result.tier2 || !result.tier3) {
    return buildDroppedTracePayload(utterance, textPreview, result);
  }

  const { tier1, tier2: t2, tier3 } = result;
  const tier2Trace = {
    intent: t2.intent,
    confidence: Math.round(t2.confidence * 100) / 100,
    riskSignalCount: t2.riskSignals.length,
    stopDeepReason: result.tier2StopDeepReasoning ?? false,
  };

  const tier3Trace = {
    forceTier4: tier3.forceTier4,
    noveltyScore: Math.round(tier3.noveltyScore * 1000) / 1000,
    memoryMatchCount: tier3.memoryMatches.length,
    ledgerMatchCount: tier3.ledgerMatches.length,
  };

  const tier4Trace = assembleTier4Trace(result);

  const highSignal = computeHighSignal(tier1, t2);
  const latencyMs = latencySnapshotFromResult(result);

  const t4Brief = formatTier4Brief(result.runTier4, tier4Trace);

  const terminalLine = `[pipeline] utt=${shortUtteranceId(utterance.utteranceId)} | T2 ${tier2Trace.intent} conf=${tier2Trace.confidence} risks=${tier2Trace.riskSignalCount} stopPrep=${tier2Trace.stopDeepReason ? "yes" : "no"} | T3 fT4=${tier3Trace.forceTier4 ? "yes" : "no"} mem=${tier3Trace.memoryMatchCount} led=${tier3Trace.ledgerMatchCount} novel=${tier3Trace.noveltyScore} | gates highSig=${highSignal ? "yes" : "no"} runT4=${result.runTier4 ? "yes" : "no"} | ${t4Brief} | T1 tec=${tier1.technicalHit ? "yes" : "no"} blk=${tier1.blocklistHit ? "yes" : "no"} prc=${tier1.pricingHit ? "yes" : "no"} text="${textPreview}"`;
  return {
    v: PIPELINE_TRACE_VERSION,
    sessionId: utterance.sessionId,
    utteranceId: utterance.utteranceId,
    timestamp: utterance.timestamp,
    textPreview,
    dropped: false,
    tier1: {
      technicalHit: tier1.technicalHit,
      blocklistHit: tier1.blocklistHit,
      pricingHit: tier1.pricingHit,
    },
    tier2: tier2Trace,
    tier3: tier3Trace,
    gate: {
      runTier4: result.runTier4,
      highSignalEstimate: highSignal,
    },
    tier4: tier4Trace,
    latencyMs,
    terminalLine,
  };
}

type RedisPublish = Pick<
  /* ioredis & minimal stubs */
  { publish: (channel: string, msg: string) => Promise<number> },
  "publish"
>;

export function stringifyPipelineTracePayload(
  payload: PipelineTracePayload
): string {
  return PIPELINE_TRACE_PRETTY_JSON
    ? `${JSON.stringify(payload, null, 2)}\n`
    : JSON.stringify(payload);
}

/** Summary object for compact (non-pretty) pino structured fields */
function pipelineTraceCompactLogFields(payload: PipelineTracePayload) {
  return {
    sessionId: payload.sessionId,
    utteranceId: payload.utteranceId,
    dropped: payload.dropped,
    tier2Intent: payload.tier2?.intent,
    runTier4: payload.gate?.runTier4,
    tier4Invoked: payload.tier4?.invoked,
    tier4Surfaced: payload.tier4?.surfaced,
    tier4LatencyMs: payload.tier4?.ms,
    pipelineLatencyMsTotal: payload.latencyMs?.total,
  };
}

function formatPipelineTerminalLog(payload: PipelineTracePayload): string {
  return `${payload.terminalLine}\n${JSON.stringify(payload, null, 2)}`;
}

/**
 * Publish a compact trace after each pipeline pass so realtime (or any subscriber)
 * can print one line beside transcript traffic without running the pipeline.
 */
export async function publishPipelineEvaluationTrace(
  redis: RedisPublish,
  utterance: Utterance,
  result: PipelineEvaluationResult
): Promise<void> {
  const payload = buildPipelineTracePayload(utterance, result);
  const channel = pipelineTraceChannel(utterance.sessionId);

  try {
    await redis.publish(channel, stringifyPipelineTracePayload(payload));
  } catch (error) {
    traceLog.warn(
      { err: error, utteranceId: utterance.utteranceId, channel },
      "Pipeline trace Redis publish failed"
    );
    return;
  }

  if (PIPELINE_TRACE_PRETTY_JSON) {
    traceLog.info(formatPipelineTerminalLog(payload));
    return;
  }

  traceLog.info(pipelineTraceCompactLogFields(payload), payload.terminalLine);
}
