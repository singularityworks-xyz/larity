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
Evaluate the context and choose exactly ONE alertType based on the provided intent, riskSignals, Tier 1 hits, and matched commitments:

1. risky_commitment (Routing: personal)
   - Trigger: TEAM speaker over-promises. (Tier 2 intent: commitment + riskSignals: underestimation, vague_deadline, unconditional_promise, open_scope, scope_creep_risk, or pricingHit).
   - Evidence: "no problem" underestimation, unconditional SLA/guarantee, unverified scope expansion, discount/approval without authority, or open-ended capability/scope guarantee.

2. scope_creep (Routing: shared)
   - Trigger: EXTERNAL (client) speaker expands scope. (Tier 2 intent: concern, question, or commitment + riskSignals: scope_creep_risk, underestimation).
   - Evidence: Client assuming unconfirmed work is in scope, or casually requesting extra features.

3. missing_clarity (Routing: shared)
   - Trigger: Substantive topic without owner/deadline/action. (Tier 2 intent: concern, commitment, or general + riskSignals: vague_ownership, vague_deadline, or unresolved pricing).
   - Evidence: Vague ownership ("Someone should..."), vague deadline ("at some point"), or unresolved pricing without a clear next step.

4. information_risk (Routing: both)
   - Trigger: Sensitive data disclosed in meeting. (Tier 1 technicalHit: api_key, password_assignment OR intent: general mentioning confidential strategy).
   - Evidence: Exposing live API keys, database passwords, internal financials, unreleased strategy/M&A, or third-party confidential details.

5. tone_warning (Routing: personal)
   - Trigger: TEAM speaker's tone is damaging. (Tier 2 tone: aggressive/defensive, especially with pricingHit or client concerns).
   - Evidence: Dismissive tone toward client, aggressive defense of pricing.

6. pressure_detected (Routing: shared)
   - Trigger: EXTERNAL speaker applies pressure. (Tier 2 intent: concern + riskSignals: pressure, timeline_risk).
   - Evidence: Urgency from authority ("CEO needs this"), social proof ("competitor does this for free"), or ultimatums.

7. self_contradiction (Routing: personal)
   - Trigger: TEAM speaker contradicts their OWN earlier commitment.
   - Evidence: Requires a Tier 3 ledger match from the SAME speaker + intent: commitment + riskSignals: backtracking / date / pricing hit.

8. team_inconsistency (Routing: shared)
   - Trigger: TEAM speaker gives conflicting info to a DIFFERENT team member's earlier commitment.
   - Evidence: Requires a Tier 3 ledger match from a DIFFERENT team member (e.g., timeline, scope, price).

9. client_backtrack (Routing: shared)
   - Trigger: EXTERNAL speaker reverses their OWN commitment.
   - Evidence: Requires a Tier 3 ledger match from the client + intent: concern/decision + riskSignals: backtracking / pricing hit.

10. policy_violation (Routing: both)
    - Trigger: Utterance conflicts with org constraints. (Tier 2 intent: commitment + riskSignals: disclosure, or commitmentType: scope for data/security).
    - Evidence: Promising to share client data with third parties, storing PII unsafely, or other compliance breaches.

11. client_disengagement (Routing: shared)
    - Trigger: EXTERNAL gives repeated minimal/passive responses after team-heavy explanation.

12. undiscussed_agenda (Routing: shared)
    - Trigger: Meeting-end only; do not emit mid-meeting unless context explicitly says agenda closeout.

- none: no actionable meeting risk, ambiguous evidence, filler, audibility check, greeting, duplicated statement, or harmless STT artifact.

Decision discipline:
- Tier 3 ledger matches are only clues. Surface only if the current utterance truly conflicts with, changes, or risks something in context. Explicitly verify speaker.userId against matched commitments.
- Prefer 'none' when evidence is weak, purely conversational, or not actionable in the next 10 seconds.
- shouldSurface=true only when confidence is high enough for a message, surfaceReason, and suggestion that help immediately in the overlay.
- Calibrate confidence: 0.9+ clear direct evidence, 0.75-0.89 likely but context dependent, <0.75 should usually not surface.

Output requirements:
- severity: low|medium|high|critical based on business impact, not wording intensity.
- message: one short headline: what happened / what needs attention (no markdown; no chain-of-thought).
- surfaceReason: when shouldSurface=true, exactly ONE short sentence the user reads as "why we flagged this" (plain language; cite minimal evidence).
- suggestion: when shouldSurface=true, one or two short sentences: concrete next step to say or do in the meeting.
- routing: strictly match the routing listed for the chosen alertType (shared, personal, both).
- targetUserId: for 'personal' routing, set to the current speaker.userId.
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
      "surfaceReason",
      "suggestion",
      "confidence",
      "shouldSurface",
      "reasoning",
      "routing",
      "targetUserId",
    ],
  };
}

export class Tier4DeepReasoner {
  private readonly ai: GoogleGenAI;
  private readonly timeoutMs: number;
  private lastPromptTokens = 0;
  private lastCompletionTokens = 0;
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
  async reason(context: Tier4Context): Promise<{
    response: Tier4Response | null;
    promptTokens: number;
    completionTokens: number;
    tokenCount: number;
  }> {
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
        return {
          response: null,
          promptTokens: this.lastPromptTokens || 0,
          completionTokens: this.lastCompletionTokens || 0,
          tokenCount:
            (this.lastPromptTokens || 0) + (this.lastCompletionTokens || 0),
        };
      }
      return {
        response: validation.data,
        promptTokens: this.lastPromptTokens || 0,
        completionTokens: this.lastCompletionTokens || 0,
        tokenCount:
          (this.lastPromptTokens || 0) + (this.lastCompletionTokens || 0),
      };
    } catch (error) {
      log.warn({ err: error }, "Tier4 reasoning failed silently");
      return {
        response: null,
        promptTokens: this.lastPromptTokens || 0,
        completionTokens: this.lastCompletionTokens || 0,
        tokenCount:
          (this.lastPromptTokens || 0) + (this.lastCompletionTokens || 0),
      };
    }
  }

  private async invokeGeminiTier4(
    prompt: string,
    timeoutMs: number
  ): Promise<string> {
    const controller = new AbortController();
    let timeoutHandle: NodeJS.Timeout | undefined;

    try {
      timeoutHandle = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      const response = await this.ai.models.generateContent({
        model: GEMINI_TIER4_MODEL,
        contents: prompt,
        config: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: geminiTier4StructuredSchema(),
          signal: controller.signal,
        },
      });

      if (!response.text) {
        throw new Error("Gemini tier4 returned empty content");
      }

      this.lastPromptTokens = response.usageMetadata?.promptTokenCount ?? 0;
      this.lastCompletionTokens =
        response.usageMetadata?.candidatesTokenCount ?? 0;

      return response.text;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("Tier4 Gemini timeout");
      }
      throw error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}
