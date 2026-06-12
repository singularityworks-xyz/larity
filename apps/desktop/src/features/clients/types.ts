export interface Client {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  description: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  industry: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ClientMemberRole =
  | "PRIMARY_CONTACT"
  | "CONTACT"
  | "STAKEHOLDER"
  | "DECISION_MAKER";

export interface ClientMember {
  id: string;
  clientId: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  department: string | null;
  notes: string | null;
  image: string | null;
  persona: Record<string, unknown> | null;
  role: ClientMemberRole;
  createdAt: string;
  updatedAt: string;
}
