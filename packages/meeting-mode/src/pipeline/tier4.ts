import { GoogleGenAI, Type } from "@google/genai";
import {
  GEMINI_API_KEY,
  GEMINI_TIER4_MODEL,
  GEMINI_TIER4_TIMEOUT_MS,
} from "../env";
import { createMeetingModeLogger } from "../logger";
import { tierContextForPromptPayload } from "./tier4-context";
import type { Tier4Context, Tier4Response } from "./types";
import { tier4ResponseSchema } from "./types";

const log = createMeetingModeLogger("tier4-deep-reason");

export interface Tier4DeepReasonerOptions {
  timeoutMs?: number;
  invoke?: (prompt: string, timeoutMs: number) => Promise<string>;
}

const CATEGORY_PROMPT_BLOCK = `
Choose exactly ONE alertType:
- none: no actionable meeting risk, ambiguous evidence, filler, audibility check, greeting, acknowledgement, duplicated statement, or harmless STT artifact.
- self_contradiction: the same TEAM speaker conflicts with their own earlier commitment/decision. If EXTERNAL backtracks, use client_backtrack.
- team_inconsistency: one TEAM member conflicts with a different TEAM member on timeline, scope, price, capability, resource, or decision.
- risky_commitment: TEAM speaker makes a risky promise: unconditional guarantee, unverified timeline/price/resource/capability, open-ended scope, discount/approval without authority, or "easy/simple/no problem" underestimation.
- scope_creep: EXTERNAL speaker expands scope beyond agreement or assumes extra work is included.
- client_backtrack: EXTERNAL speaker changes a previous commitment, timeline, scope, price, or decision.
- missing_clarity: only when a substantive topic lacks owner, deadline, next action, or mutual confirmation. Do NOT use for one-off malformed STT fragments.
- information_risk: confidential client names, internal financials, credentials/secrets, unreleased features, roadmap/strategy, or third-party confidential details may be exposed.
- tone_warning: TEAM tone is defensive/aggressive/reactive/excessively apologetic enough to affect the meeting.
- pressure_detected: EXTERNAL uses urgency, social proof, authority, guilt, or implicit threat pressure.
- policy_violation: utterance conflicts with relevant constraints, policy guardrails, compliance, legal, or security requirements.
- client_disengagement: EXTERNAL gives repeated minimal/passive responses after team-heavy explanation.
- undiscussed_agenda: meeting-end only; do not emit mid-meeting unless context explicitly says agenda closeout.

Decision discipline:
- A Tier 3 memory/ledger match is only a clue. Surface only if the current utterance truly conflicts with, changes, or risks something in context.
- Prefer alertType none when evidence is weak, duplicated, already obvious, purely conversational, or not actionable in the next 10 seconds.
- shouldSurface=true only when confidence is high enough for message, surfaceReason, and suggestion that help immediately in the overlay.
- Calibrate confidence: 0.9+ clear direct evidence, 0.75-0.89 likely but context dependent, <0.75 should usually not surface.

Routing:
- personal: self_contradiction/risky_commitment/tone_warning for the current TEAM speaker when only private coaching is needed. Set targetUserId if known.
- shared: team_inconsistency, scope_creep, client_backtrack, missing_clarity, pressure_detected, client_disengagement, undiscussed_agenda, or another TEAM member's self/risk/tone issue.
- both: information_risk or policy_violation when both team coordination and speaker-specific caution matter.

Output requirements:
- severity: low|medium|high|critical based on business impact, not wording intensity.
- message: one short headline: what happened / what needs attention (no markdown; no chain-of-thought).
- surfaceReason: when shouldSurface=true, exactly ONE short sentence the user reads as "why we flagged this" (plain language; cite minimal evidence).
- suggestion: when shouldSurface=true, one or two short sentences: concrete next step to say or do in the meeting (defer to legal/manager/etc. only if warranted).
- When shouldSurface=false or alertType=none: set surfaceReason and suggestion to null.
- reasoning: internal audit-only evidence trace; longer ok; never user-facing alone.
- Return strict JSON only with fields alertType severity message surfaceReason suggestion confidence shouldSurface reasoning routing targetUserId.
`.trim();

function parseTierLikeJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Tier4 returned empty response");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("Tier4 response did not contain JSON");
    }

    const jsonChunk = trimmed.slice(firstBrace, lastBrace + 1);
    return JSON.parse(jsonChunk);
  }
}

function buildTier4Prompt(context: Tier4Context): string {
  const structured = tierContextForPromptPayload(context);

  const lines = [
    "You are Tier 4 deep reasoning for multilingual live business conversations.",
    "Given structured context JSON, decide if ONE atomic alert should surface for the trigger utterance under review.",
    "Optimize for precision and live usefulness: false positives are costly, but clear policy, information, contradiction, and risky-commitment issues should surface.",
    "Account for broken STT punctuation and code-switching; infer only from evidence present in the context JSON.",
    CATEGORY_PROMPT_BLOCK,
    "",
    "## Context JSON",
    JSON.stringify(structured),
    "",
    "Return only JSON with every required Tier4 field.",
  ];

  return lines.join("\n");
}

function geminiTier4StructuredSchema(): {
  type: typeof Type.OBJECT;
  properties: Record<string, unknown>;
  required: string[];
} {
  return {
    type: Type.OBJECT,
    properties: {
      alertType: {
        type: Type.STRING,
        enum: [
          "none",
          "self_contradiction",
          "team_inconsistency",
          "risky_commitment",
          "scope_creep",
          "client_backtrack",
          "missing_clarity",
          "information_risk",
          "tone_warning",
          "pressure_detected",
          "policy_violation",
          "client_disengagement",
          "undiscussed_agenda",
        ],
      },
      severity: {
        type: Type.STRING,
        enum: ["low", "medium", "high", "critical"],
      },
      message: { type: Type.STRING },
      surfaceReason: {
        type: Type.STRING,
        nullable: true,
      },
      suggestion: {
        type: Type.STRING,
        nullable: true,
      },
      confidence: { type: Type.NUMBER },
      shouldSurface: { type: Type.BOOLEAN },
      reasoning: { type: Type.STRING },
      routing: {
        type: Type.STRING,
        enum: ["shared", "personal", "both"],
      },
      targetUserId: {
        type: Type.STRING,
        nullable: true,
      },
    },
    required: [
      "alertType",
      "severity",
      "message",
      "confidence",
      "shouldSurface",
      "reasoning",
      "routing",
    ],
  };
}

export class Tier4DeepReasoner {
  private readonly ai: GoogleGenAI;
  private readonly timeoutMs: number;
  private readonly invoke: (
    prompt: string,
    timeoutMs: number
  ) => Promise<string>;

  constructor(options: Tier4DeepReasonerOptions = {}) {
    this.ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    this.timeoutMs = options.timeoutMs ?? GEMINI_TIER4_TIMEOUT_MS;
    this.invoke =
      options.invoke ??
      ((prompt, timeoutMs) => this.invokeGeminiTier4(prompt, timeoutMs));
  }

  /**
   * Returns parsed Tier 4 structured JSON or **null** on timeout / malformed / schema violation.
   * Callers MUST still enforce surfacing thresholds (confidence, shouldSurface).
   */
  async reason(context: Tier4Context): Promise<Tier4Response | null> {
    const prompt = buildTier4Prompt(context);

    try {
      const raw = await this.invoke(prompt, this.timeoutMs);
      const parsed = parseTierLikeJson(raw);
      const validation = tier4ResponseSchema.safeParse(parsed);
      if (!validation.success) {
        log.warn(
          { issues: validation.error.issues.map((issue) => issue.message) },
          "Tier4 returned invalid schema"
        );
        return null;
      }
      return validation.data;
    } catch (error) {
      log.warn({ err: error }, "Tier4 reasoning failed silently");
      return null;
    }
  }

  private async invokeGeminiTier4(
    prompt: string,
    timeoutMs: number
  ): Promise<string> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timeoutHandle = setTimeout(() => {
        clearTimeout(timeoutHandle);
        reject(new Error("Tier4 Gemini timeout"));
      }, timeoutMs);
    });

    const call = this.ai.models.generateContent({
      model: GEMINI_TIER4_MODEL,
      contents: prompt,
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: geminiTier4StructuredSchema(),
      },
    });

    const response = await Promise.race([call, timeoutPromise]);

    if (!response.text) {
      throw new Error("Gemini tier4 returned empty content");
    }

    return response.text;
  }
}
