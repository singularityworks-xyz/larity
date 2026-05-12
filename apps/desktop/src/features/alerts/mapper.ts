import type {
  AlertCategory,
  AlertRouting,
  AlertSeverity,
  MeetingAlert,
} from "./types";

function extractString(
  data: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    if (typeof data[key] === "string") {
      return data[key] as string;
    }
  }
  return "";
}

function extractNumber(
  data: Record<string, unknown>,
  fallback: number,
  ...keys: string[]
): number {
  for (const key of keys) {
    const val = data[key];
    if (typeof val === "number") {
      return val;
    }
  }
  return fallback;
}

function extractBoolean(
  data: Record<string, unknown>,
  ...keys: string[]
): boolean {
  for (const key of keys) {
    if (typeof data[key] === "boolean") {
      return data[key] as boolean;
    }
  }
  return false;
}

function parseCategory(raw: string): AlertCategory {
  const categoryMap: Record<string, AlertCategory> = {
    self_contradiction: "self_contradiction",
    team_inconsistency: "team_inconsistency",
    risky_commitment: "risky_commitment",
    scope_creep: "scope_creep",
    client_backtrack: "client_backtrack",
    missing_clarity: "missing_clarity",
    information_risk: "information_risk",
    tone_warning: "tone_warning",
    pressure_detected: "pressure_detected",
    policy_violation: "policy_violation",
    client_disengagement: "client_disengagement",
    undiscussed_agenda: "undiscussed_agenda",
  };
  return categoryMap[raw] ?? "missing_clarity";
}

function parseSeverity(raw: string): AlertSeverity {
  const normalized = raw.toLowerCase();
  if (["critical", "error", "danger", "fatal"].includes(normalized)) {
    return "critical";
  }
  if (["high"].includes(normalized)) {
    return "high";
  }
  if (["medium", "warning", "warn"].includes(normalized)) {
    return "medium";
  }
  return "low";
}

function parseRouting(raw: string, isShared: boolean): AlertRouting {
  if (raw === "shared" || raw === "personal" || raw === "both") {
    return raw as AlertRouting;
  }
  return isShared ? "shared" : "personal";
}

export function mapBackendAlertToMeetingAlert(
  data: Record<string, unknown>
): MeetingAlert | null {
  const id = extractString(data, "alertId", "id");
  if (!id) {
    return null;
  }

  const rawCategory = extractString(data, "category", "alertType");
  const rawSeverity = extractString(data, "severity", "level");
  const isShared = extractBoolean(data, "isShared", "shared");
  const routing = parseRouting(extractString(data, "routing"), isShared);

  const speakerObj =
    typeof data.speaker === "object" && data.speaker !== null
      ? (data.speaker as Record<string, unknown>)
      : null;

  const speakerName = speakerObj
    ? extractString(speakerObj, "name")
    : extractString(data, "speakerName", "speaker");

  const speakerTypeRaw = speakerObj
    ? extractString(speakerObj, "type").toUpperCase()
    : extractString(data, "speakerType", "speakerRole").toUpperCase();

  const speakerType =
    speakerTypeRaw === "TEAM" || speakerTypeRaw === "EXTERNAL"
      ? speakerTypeRaw
      : undefined;

  const reasoning = extractString(data, "reasoning");
  const surfaceReason = extractString(data, "surfaceReason", "reason");

  const evidenceObj =
    data.evidence && typeof data.evidence === "object"
      ? (data.evidence as Record<string, unknown>)
      : null;
  let evidence: { utterance: string; reasoning: string } | undefined;
  if (evidenceObj) {
    evidence = {
      utterance: extractString(evidenceObj, "utterance"),
      reasoning: extractString(evidenceObj, "reasoning") || reasoning,
    };
  } else if (reasoning) {
    evidence = { utterance: "", reasoning };
  }

  return {
    id,
    category: parseCategory(rawCategory),
    severity: parseSeverity(rawSeverity),
    title: extractString(data, "title", "summary", "message") || "Alert",
    message: extractString(data, "message", "description") || "",
    surfaceReason,
    suggestion: extractString(data, "suggestion", "action"),
    speakerName,
    speakerType,
    routing,
    isShared,
    timestamp: extractNumber(data, Date.now(), "timestamp", "ts"),
    confidence: extractNumber(data, 0.9, "confidence", "score"),
    triggerTier: extractNumber(data, 1, "triggerTier", "tier") as 1 | 2 | 3 | 4,
    evidence,
  };
}
