import { prisma } from "../lib/prisma";
import type {
  CreatePolicyGuardrailInput,
  UpdatePolicyGuardrailInput,
} from "../validators";
import { DEFAULT_POLICY_GUARDRAILS } from "./default-guardrails";

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

  findById(id: string, orgId: string) {
    return prisma.policyGuardrail.findFirst({
      where: { id, orgId },
      include: {
        org: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  },

  findAll(
    orgId: string,
    query?: {
      clientId?: string;
      ruleType?: string;
      severity?: string;
      isActive?: boolean;
    }
  ) {
    return prisma.policyGuardrail.findMany({
      where: {
        orgId,
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

  async update(id: string, orgId: string, data: UpdatePolicyGuardrailInput) {
    const existing = await prisma.policyGuardrail.findFirst({
      where: { id, orgId },
    });
    if (!existing) {
      throw new Error("Policy guardrail not found");
    }

    return prisma.policyGuardrail.update({
      where: { id },
      data,
      include: {
        org: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
    });
  },

  async activate(id: string, orgId: string) {
    const existing = await prisma.policyGuardrail.findFirst({
      where: { id, orgId },
    });
    if (!existing) {
      throw new Error("Policy guardrail not found");
    }

    return prisma.policyGuardrail.update({
      where: { id },
      data: { isActive: true },
    });
  },

  async deactivate(id: string, orgId: string) {
    const existing = await prisma.policyGuardrail.findFirst({
      where: { id, orgId },
    });
    if (!existing) {
      throw new Error("Policy guardrail not found");
    }

    return prisma.policyGuardrail.update({
      where: { id },
      data: { isActive: false },
    });
  },

  async delete(id: string, orgId: string) {
    const existing = await prisma.policyGuardrail.findFirst({
      where: { id, orgId },
    });
    if (!existing) {
      throw new Error("Policy guardrail not found");
    }

    return prisma.policyGuardrail.delete({
      where: { id },
    });
  },

  async seedDefaultForOrg(orgId: string) {
    return await prisma.$transaction(async (tx) => {
      // Lock the Org row to prevent concurrent seeding race conditions
      await tx.$executeRaw`SELECT id FROM orgs WHERE id = ${orgId} FOR UPDATE`;

      const existingCount = await tx.policyGuardrail.count({
        where: { orgId, clientId: null },
      });

      if (existingCount > 0) {
        return {
          seeded: false,
          message: "Guardrails already exist for this org.",
        };
      }

      const payload = DEFAULT_POLICY_GUARDRAILS.map((g) => ({
        ...g,
        orgId,
        ruleType: g.ruleType as
          | "NDA"
          | "LEGAL"
          | "TERMINOLOGY"
          | "INTERNAL"
          | "CUSTOM",
        severity: g.severity as "INFO" | "WARNING" | "BLOCK",
      }));

      await tx.policyGuardrail.createMany({
        data: payload,
      });

      return { seeded: true, count: payload.length };
    });
  },
};
