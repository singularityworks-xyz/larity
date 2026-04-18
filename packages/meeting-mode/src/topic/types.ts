export interface Constraint {
  id: string;
  description: string;
}

export interface Commitment {
  id: string;
  description: string;
  owner?: string;
  dueDate?: string;
}

export interface RiskFlag {
  id: string;
  description: string;
  severity: "low" | "medium" | "high";
}

export interface TopicCompleteness {
  hasOwner: boolean;
  ownerName?: string;
  hasDeadline: boolean;
  deadline?: string;
  hasActionItems: boolean;
  actionItems: string[];
  hasExplicitConfirmation: boolean;
}

export interface TopicState {
  topicId: string;
  label: string;
  summary: string;
  constraintsMentioned: Constraint[];
  commitmentsMentioned: Commitment[];
  riskFlags: RiskFlag[];
  centroid: number[];
  utteranceCount: number; // Important for calculating running centroid
  lastUpdated: number;
  completeness: TopicCompleteness;
}

export interface UtteranceWithTopic {
  utteranceId: string;
  topicId: string;
  text: string;
}
