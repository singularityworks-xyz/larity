import { applyPagination } from "../lib/pagination";
import { prisma } from "../lib/prisma";
import type {
  CreateTaskInput,
  TaskQueryInput,
  UpdateTaskInput,
} from "../validators";

export const TaskService = {
  create(data: CreateTaskInput) {
    return prisma.task.create({
      data,
      include: {
        client: { select: { id: true, name: true, slug: true } },
        meeting: { select: { id: true, title: true } },
        decision: { select: { id: true, title: true, decisionRef: true } },
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });
  },

  findById(id: string) {
    return prisma.task.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        meeting: { select: { id: true, title: true } },
        decision: { select: { id: true, title: true, decisionRef: true } },
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });
  },

  findAll(query?: TaskQueryInput) {
    return prisma.task.findMany({
      where: {
        clientId: query?.clientId,
        status: query?.status as
          | "OPEN"
          | "IN_PROGRESS"
          | "BLOCKED"
          | "DONE"
          | "CANCELLED"
          | undefined,
        priority: query?.priority as
          | "LOW"
          | "MEDIUM"
          | "HIGH"
          | "CRITICAL"
          | undefined,
        assigneeId: query?.assigneeId,
        meetingId: query?.meetingId,
        decisionId: query?.decisionId,
        dueAt: {
          ...(query?.dueBefore && { lte: query.dueBefore }),
          ...(query?.dueAfter && { gte: query.dueAfter }),
        },
      },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        meeting: { select: { id: true, title: true } },
        decision: { select: { id: true, title: true, decisionRef: true } },
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      ...applyPagination(query),
    });
  },

  update(id: string, data: UpdateTaskInput) {
    return prisma.task.update({
      where: { id },
      data,
      include: {
        client: { select: { id: true, name: true, slug: true } },
        meeting: { select: { id: true, title: true } },
        decision: { select: { id: true, title: true, decisionRef: true } },
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });
  },

  delete(id: string) {
    return prisma.task.delete({
      where: { id },
    });
  },

  async markComplete(id: string) {
    // Validate status transition: cannot complete CANCELLED tasks
    const task = await prisma.task.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!task) {
      throw new Error("Task not found");
    }

    if (task.status === "CANCELLED") {
      throw new Error("Cannot complete a cancelled task");
    }

    if (task.status === "DONE") {
      throw new Error("Task is already completed");
    }

    return prisma.task.update({
      where: { id },
      data: {
        status: "DONE",
        completedAt: new Date(),
      },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });
  },

  async markOpen(id: string) {
    const task = await prisma.task.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!task) {
      throw new Error("Task not found");
    }

    if (task.status === "CANCELLED") {
      throw new Error("Cannot reopen a cancelled task");
    }

    return prisma.task.update({
      where: { id },
      data: {
        status: "OPEN",
        completedAt: null,
      },
    });
  },

  async markInProgress(id: string) {
    const task = await prisma.task.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!task) {
      throw new Error("Task not found");
    }

    if (task.status === "CANCELLED" || task.status === "DONE") {
      throw new Error(`Cannot start a ${task.status.toLowerCase()} task`);
    }

    return prisma.task.update({
      where: { id },
      data: { status: "IN_PROGRESS" },
    });
  },

  async markBlocked(id: string) {
    const task = await prisma.task.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!task) {
      throw new Error("Task not found");
    }

    if (task.status === "CANCELLED" || task.status === "DONE") {
      throw new Error(`Cannot block a ${task.status.toLowerCase()} task`);
    }

    return prisma.task.update({
      where: { id },
      data: { status: "BLOCKED" },
    });
  },
};
