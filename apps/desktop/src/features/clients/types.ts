export interface Client {
  createdAt: string;
  description: string | null;
  id: string;
  industry: string | null;
  name: string;
  orgId: string;
  slug: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  updatedAt: string;
}

export type ClientMemberRole =
  | "PRIMARY_CONTACT"
  | "CONTACT"
  | "STAKEHOLDER"
  | "DECISION_MAKER";

export interface MemberPersona {
  communicationStyle?: string;
  dislikes?: string[];
  keyPriorities?: string[];
  likes?: string[];
  notes?: string;
  tone?: string;
  [key: string]: unknown;
}

export interface ClientMember {
  clientId: string;
  createdAt: string;
  department: string | null;
  email: string | null;
  id: string;
  image: string | null;
  name: string;
  notes: string | null;
  persona: MemberPersona | null;
  phone: string | null;
  role: ClientMemberRole;
  title: string | null;
  updatedAt: string;
}
