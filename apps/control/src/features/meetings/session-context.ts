import { redis } from "@larity/db/redis";
import { redisKeys } from "@larity/db/redis/keys";
import { TTL } from "@larity/db/redis/ttl";
import { prisma } from "../../lib/prisma";
import { SESSION_TTL } from "./session-constants";

const CONTEXT_LOOKBACK_DAYS = 84;
const CONTEXT_MAX_RESULTS = 100;
const AGENDA_SPLIT_REGEX = /\r?\n/;
const AGENDA_BULLET_PREFIX_REGEX = /^\s*(?:[-*]|\d+[.)])\s*/;
const KEYWORD_HINTS = ["blocklist", "keyword", "blocked"] as const;

interface SessionPreloadedDecision {
  content: string;
  createdAt: number;
  id: string;
  tags: string[];
  title: string;
}

interface SessionPreloadedPolicyGuardrail {
  clientId: string | null;
  description: string;
  id: string;
  keywords: string[];
  name: string;
  pattern: string | null;
  ruleType: string;
  severity: string;
}

interface SessionPreloadedPoint {
  content: string;
  createdAt: number;
  id: string;
}

interface SessionPreloadedContext {
  activePolicyGuardrails: SessionPreloadedPolicyGuardrail[];
  calendarAgendaItems: string[];
  clientId: string;
  clientNameList: string[];
  keywordBlocklists: string[];
  knownConstraints: SessionPreloadedPoint[];
  loadedAt: number;
  meetingId: string;
  openDecisions: SessionPreloadedDecision[];
  orgId: string;
  priorCommitments: SessionPreloadedPoint[];
  sessionId: string;
  version: 1;
}

export async function preloadContext(input: {
  sessionId: string;
  meetingId: string;
  clientId: string;
  clientName: string;
  orgId: string;
  orgSettings: unknown;
  agenda: string | null;
}): Promise<SessionPreloadedContext> {
  const {
    sessionId,
    meetingId,
    clientId,
    clientName,
    orgId,
    orgSettings,
    agenda,
  } = input;

  const lookbackMs = CONTEXT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const createdAfter = new Date(Date.now() - lookbackMs);

  const [decisions, constraints, priorCommitments, guardrails, clientMembers] =
    await Promise.all([
      prisma.decision.findMany({
        where: {
          clientId,
          status: "ACTIVE",
          createdAt: { gte: createdAfter },
        },
        orderBy: { createdAt: "desc" },
        take: CONTEXT_MAX_RESULTS,
        select: {
          id: true,
          title: true,
          content: true,
          tags: true,
          createdAt: true,
        },
      }),
      prisma.importantPoint.findMany({
        where: {
          clientId,
          category: "CONSTRAINT",
        },
        orderBy: { createdAt: "desc" },
        take: CONTEXT_MAX_RESULTS,
        select: {
          id: true,
          content: true,
          createdAt: true,
        },
      }),
      prisma.importantPoint.findMany({
        where: {
          clientId,
          category: "COMMITMENT",
          OR: [{ meetingId: null }, { meetingId: { not: meetingId } }],
        },
        orderBy: { createdAt: "desc" },
        take: CONTEXT_MAX_RESULTS,
        select: {
          id: true,
          content: true,
          createdAt: true,
        },
      }),
      prisma.policyGuardrail.findMany({
        where: {
          orgId,
          isActive: true,
          OR: [{ clientId: null }, { clientId }],
        },
        orderBy: { createdAt: "desc" },
        take: CONTEXT_MAX_RESULTS,
        select: {
          id: true,
          name: true,
          description: true,
          ruleType: true,
          severity: true,
          keywords: true,
          pattern: true,
          clientId: true,
        },
      }),
      prisma.clientMember.findMany({
        where: { clientId },
        select: { name: true },
        take: CONTEXT_MAX_RESULTS,
        orderBy: { name: "asc" },
      }),
    ]);

  const guardrailKeywords = guardrails.flatMap((guardrail) =>
    guardrail.keywords.filter((keyword) => keyword.trim().length > 0)
  );
  const settingsKeywords = extractKeywordBlocklists(orgSettings);
  const keywordBlocklists = [
    ...new Set([...settingsKeywords, ...guardrailKeywords]),
  ];

  const clientNameList = [
    clientName,
    ...clientMembers.map((member) => member.name),
  ].filter(
    (name, index, names) =>
      name.trim().length > 0 && names.indexOf(name) === index
  );

  const payload: SessionPreloadedContext = {
    version: 1,
    sessionId,
    meetingId,
    clientId,
    orgId,
    loadedAt: Date.now(),
    openDecisions: decisions.map((decision) => ({
      id: decision.id,
      title: decision.title,
      content: decision.content,
      tags: decision.tags,
      createdAt: decision.createdAt.getTime(),
    })),
    knownConstraints: constraints.map((constraint) => ({
      id: constraint.id,
      content: constraint.content,
      createdAt: constraint.createdAt.getTime(),
    })),
    activePolicyGuardrails: guardrails.map((guardrail) => ({
      id: guardrail.id,
      name: guardrail.name,
      description: guardrail.description,
      ruleType: guardrail.ruleType,
      severity: guardrail.severity,
      keywords: guardrail.keywords,
      pattern: guardrail.pattern,
      clientId: guardrail.clientId,
    })),
    priorCommitments: priorCommitments.map((commitment) => ({
      id: commitment.id,
      content: commitment.content,
      createdAt: commitment.createdAt.getTime(),
    })),
    clientNameList,
    keywordBlocklists,
    calendarAgendaItems: parseAgendaItems(agenda),
  };

  await redis.set(
    redisKeys.meetingContext(sessionId),
    JSON.stringify(payload),
    "EX",
    Math.min(SESSION_TTL, TTL.MEETING_CONTEXT)
  );

  return payload;
}

function parseAgendaItems(agenda: string | null): string[] {
  if (!agenda) {
    return [];
  }

  return agenda
    .split(AGENDA_SPLIT_REGEX)
    .map((line) => line.replace(AGENDA_BULLET_PREFIX_REGEX, "").trim())
    .filter((line) => line.length > 0);
}

function extractKeywordBlocklists(settings: unknown): string[] {
  if (!(settings && typeof settings === "object")) {
    return [];
  }

  const keywords = new Set<string>();
  collectKeywordValues(settings, keywords, false);

  return [...keywords];
}

function collectKeywordValues(
  value: unknown,
  keywords: Set<string>,
  shouldCollectString: boolean
): void {
  if (typeof value === "string") {
    if (!shouldCollectString) {
      return;
    }

    const cleaned = value.trim();
    if (cleaned.length > 0) {
      keywords.add(cleaned);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeywordValues(item, keywords, shouldCollectString);
    }
    return;
  }

  if (!(value && typeof value === "object")) {
    return;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const shouldCollectChild = shouldCollectString || hasKeywordHint(key);
    collectKeywordValues(child, keywords, shouldCollectChild);
  }
}

function hasKeywordHint(key: string): boolean {
  const lowered = key.toLowerCase();
  return KEYWORD_HINTS.some((hint) => lowered.includes(hint));
}
