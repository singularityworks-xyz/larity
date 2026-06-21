import { GoogleGenAI, Type } from "@google/genai";
import { publishSystemEvent } from "@larity/infra/redis";
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
  invoke?: (prompt: string, timeoutMs: number) => Promise<string>;
  timeoutMs?: number;
}

const CATEGORY_PROMPT_BLOCK = `
Evaluate the context JSON and choose exactly ONE alertType. Base your decision on the provided tier2 (intent, tone, riskSignals), tier1 (blocklistHit, technicalHit, pricingHit), speaker identity (type: TEAM/EXTERNAL), and matchedCommitments (Tier 3 ledger matches). riskSignal names match Tier 2 exactly.

1. risky_commitment (Routing: personal)
   - Trigger: TEAM speaker over-promises. Gate: tier2.intent=commitment AND riskSignals contains any of: underestimation, vague_deadline, unconditional_promise, open_scope, scope_creep.
   - Also triggered when tier2.intent=commitment with riskSignals contains pricing_discussed OR tier1.pricingHit=true AND the commitment is a price/discount/scope guarantee without clear limits.
   - Evidence: "no problem" underestimation, unconditional SLA/guarantee, unverified scope expansion ("entire mobile app within same budget"), discount/approval without authority ("I'll approve 30%", "consider it done"), or open-ended capability/scope guarantee ("any tool you need, no extra cost").
   - Do NOT fire for normal confident commitments with clear scope and timeline.

2. scope_creep (Routing: shared)
   - Trigger: EXTERNAL (client) speaker expands scope. Gate: riskSignals contains scope_creep (and speaker.type=EXTERNAL).
   - Can also fire when intent=concern and riskSignals contains scope_creep (client questioning scope boundaries is still scope_creep).
   - Evidence: Client assuming unconfirmed work is in scope, casually requesting extra features, or implying deliverables were always included.

3. missing_clarity (Routing: shared)
   - Trigger: Substantive topic without owner/deadline/action. Gate: riskSignals contains vague_ownership OR vague_deadline — regardless of intent.
   - Also triggered when tier1.pricingHit=true (or riskSignals contains pricing_discussed) AND the utterance describes unresolved pricing with no next action or owner.
   - Evidence: Vague ownership ("Someone should...", "we need to sort out"), vague deadline ("at some point", "we'll follow up"), or pricing discussion without resolution.

4. information_risk (Routing: both)
   - Trigger: Sensitive data disclosed in meeting. Gate: tier1.technicalHit=true (API key, password, JWT, credential pattern) — fires regardless of intent or riskSignals.
   - Also triggered when riskSignals contains disclosure AND speaker discusses: unreleased M&A, confidential strategy, internal financials, client PII, third-party secrets, or other protected information.
   - Evidence: Exposing live API keys, database passwords, internal financials, unreleased strategy/M&A, or third-party confidential details.

5. tone_warning (Routing: personal)
   - Trigger: TEAM speaker's tone is damaging to relationship. Gate: tier2.tone=aggressive AND (riskSignals contains any of underestimation/pressure OR tier1.pricingHit=true OR intent=concern).
   - If tone=defensive, only fire when paired with riskSignals (especially underestimation or pressure) — defensive alone is usually justified explanation, not a warning.
   - Do NOT fire on tone=confident or tone=neutral regardless of content.
   - Evidence: Dismissive aggressive tone toward client ("that's just not how software works"), aggressive defense of pricing with dismissive language.

6. pressure_detected (Routing: shared)
   - Trigger: EXTERNAL speaker applies pressure or emotional manipulation. Gate: riskSignals contains pressure OR manipulation AND speaker.type=EXTERNAL.
   - Also triggered when riskSignals contains timeline_risk (ultimatum timeliness).
   - Evidence: Direct pressure — urgency from authority ("CEO needs this"), social proof ("competitor does this for free"), ultimatums ("signed by Friday or we go elsewhere"). Manipulation — guilt-tripping ("after everything we've done"), playing victim ("you'll put us out of business"), false urgency ("my job depends on this"), flattery-as-leverage.

7. self_contradiction (Routing: personal)
   - Trigger: TEAM speaker contradicts their OWN earlier commitment. Gate: matchedCommitments exists where matchedCommitment.commitment.speaker.userId === currentSpeaker.userId AND (riskSignals contains backtracking OR tier1.pricingHit=true OR tier2.intent=commitment with timeline/price).
   - Explicitly verify speaker.userId matches. If different speaker, this is team_inconsistency, not self_contradiction.
   - Evidence: "We can't make March 15th" when speaker earlier committed to March 15th.

8. team_inconsistency (Routing: shared)
   - Trigger: TEAM speaker gives conflicting info to a DIFFERENT team member's earlier commitment.
   - Gate: matchedCommitments exists where matchedCommitment.commitment.speaker.userId !== currentSpeaker.userId AND matchedCommitment.commitment.speaker.type === "TEAM".
   - Evidence: Team member B says "8 weeks" when team member A earlier committed to "4 weeks."

9. client_backtrack (Routing: shared)
   - Trigger: EXTERNAL speaker reverses their OWN commitment. Gate: matchedCommitments exists where matchedCommitment.commitment.speaker.userId === currentSpeaker.userId AND speaker.type=EXTERNAL AND (riskSignals contains backtracking OR tier1.pricingHit=true OR riskSignals contains pricing_discussed).
   - Evidence: Client says "we never agreed to that pricing" when they earlier accepted the price.

10. policy_violation (Routing: both)
    - Trigger: Utterance conflicts with org constraints. Gate: riskSignals contains disclosure OR compliance.
    - Also triggered when tier2.intent=commitment with commitmentType=scope AND the scope involves data sharing, PII, or security-sensitive work.
    - Evidence: Promising to share client data with third parties, storing PII unsafely, or other compliance breaches.

11. client_disengagement (Routing: shared)
    - Trigger: EXTERNAL gives repeated minimal/passive responses after team-heavy explanation. Only if context includes speaker state data suggesting disengagement pattern. Rare.

12. undiscussed_agenda (Routing: shared)
    - Trigger: Meeting-end only; do not emit mid-meeting unless context explicitly says agenda closeout. Rare.

- none: no actionable meeting risk, ambiguous evidence, filler, audibility check, greeting, duplicated statement, or harmless STT artifact.

Decision discipline:
- matchedCommitments list may be empty. Only use it for contradiction/inconsistency/backtrack categories.
- Explicitly verify matchedCommitment.commitment.speaker.userId against currentSpeaker.userId: same = self_contradiction or client_backtrack; different TEAM = team_inconsistency; different EXTERNAL = weak evidence, prefer none.
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
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: pre-existing, refactor deferred
  async reason(context: Tier4Context): Promise<{
    response: Tier4Response | null;
    promptTokens: number;
    completionTokens: number;
    tokenCount: number;
  }> {
    const prompt = buildTier4Prompt(context);
    const sessionId = context.sessionId;

    try {
      const raw = await this.invoke(prompt, this.timeoutMs);
      const parsed = parseTierLikeJson(raw);
      const validation = tier4ResponseSchema.safeParse(parsed);
      if (!validation.success) {
        log.warn(
          { issues: validation.error.issues.map((issue) => issue.message) },
          "Tier4 returned invalid schema"
        );
        if (sessionId) {
          publishSystemEvent(sessionId, {
            source: "gemini",
            severity: "warning",
            code: "GEMINI_SCHEMA_ERROR",
            message:
              "Deep reasoning returned an invalid response format. Falling back safely.",
          }).catch(() => undefined);
        }
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
      if (sessionId) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const isTimeout = errMsg.toLowerCase().includes("timeout");
        publishSystemEvent(sessionId, {
          source: "gemini",
          severity: "warning",
          code: isTimeout ? "GEMINI_TIMEOUT" : "GEMINI_ERROR",
          message: isTimeout
            ? "Deep reasoning request timed out (>1500ms). Falling back safely."
            : "Deep reasoning engine is offline or overloaded. Falling back safely.",
        }).catch(() => undefined);
      }
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
        },
        signal: controller.signal,
        // biome-ignore lint/suspicious/noExplicitAny: Gemini SDK signal type mismatch
      } as any);

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
