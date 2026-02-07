import { prisma } from "../lib/prisma";
import type {
  CreatePolicyGuardrailInput,
  UpdatePolicyGuardrailInput,
} from "../validators";

export const PolicyGuardrailService = {
  create(data: CreatePolicyGuardrailInput) {
    return prisma.policyGuardrail.create({
      data,
      include: {
        org: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  },

  findById(id: string) {
    return prisma.policyGuardrail.findUnique({
      where: { id },
      include: {
        org: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  },

  findAll(query?: {
    orgId?: string;
    clientId?: string;
    ruleType?: string;
    severity?: string;
    isActive?: boolean;
  }) {
    return prisma.policyGuardrail.findMany({
      where: {
        orgId: query?.orgId,
        clientId: query?.clientId,
        ruleType: query?.ruleType as
          | "NDA"
          | "LEGAL"
          | "TERMINOLOGY"
          | "INTERNAL"
          | "CUSTOM"
          | undefined,
        severity: query?.severity as "INFO" | "WARNING" | "BLOCK" | undefined,
        isActive: query?.isActive,
      },
      include: {
        org: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  // Get all active guardrails for a client (org-level + client-specific)
  findActiveForClient(orgId: string, clientId: string) {
    return prisma.policyGuardrail.findMany({
      where: {
        orgId,
        isActive: true,
        OR: [
          { clientId: null }, // Org-level
          { clientId }, // Client-specific
        ],
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    });
  },

  update(id: string, data: UpdatePolicyGuardrailInput) {
    return prisma.policyGuardrail.update({
      where: { id },
      data,
      include: {
        org: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
    });
  },

  activate(id: string) {
    return prisma.policyGuardrail.update({
      where: { id },
      data: { isActive: true },
    });
  },

  deactivate(id: string) {
    return prisma.policyGuardrail.update({
      where: { id },
      data: { isActive: false },
    });
  },

  delete(id: string) {
    return prisma.policyGuardrail.delete({
      where: { id },
    });
  },
};
