export interface Constraint {
  description: string;
  id: string;
}

export interface Commitment {
  description: string;
  dueDate?: string;
  id: string;
  owner?: string;
}

export interface RiskFlag {
  description: string;
  id: string;
  severity: "low" | "medium" | "high";
}

export interface TopicCompleteness {
  actionItems: string[];
  deadline?: string;
  hasActionItems: boolean;
  hasDeadline: boolean;
  hasExplicitConfirmation: boolean;
  hasOwner: boolean;
  ownerName?: string;
}

export interface TopicState {
  centroid: number[];
  commitmentsMentioned: Commitment[];
  completeness: TopicCompleteness;
  constraintsMentioned: Constraint[];
  label: string;
  lastUpdated: number;
  riskFlags: RiskFlag[];
  summary: string;
  topicId: string;
  utteranceCount: number; // Important for calculating running centroid
}

export interface UtteranceWithTopic {
  text: string;
  topicId: string;
  utteranceId: string;
}
