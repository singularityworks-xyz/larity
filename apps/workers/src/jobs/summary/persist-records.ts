import { randomUUID } from "node:crypto";
import type { Prisma } from "@larity/db/prisma";
import type { RedisCommitment } from "./commitments";
import { cosineSimilarity } from "./deduplication";
import type {
  ExtractedDecision,
  ExtractedImportantPoint,
  ExtractedOpenQuestion,
  ExtractedTask,
} from "./extraction-llm";

export async function persistDecisionsTx(
  tx: Prisma.TransactionClient,
  clientId: string,
  meetingId: string,
  decisionsWithEmbeddings: Array<{
    d: ExtractedDecision;
    embedding: number[];
  }>,
  existingDecisions: Array<{
    id: string;
    decisionRef: string;
    version: number;
  }>,
  oldEmbeddingMap: Map<string, number[]>
): Promise<void> {
  const updatedRefs = new Set<string>();

  for (const { d, embedding } of decisionsWithEmbeddings) {
    let decisionRef: string = randomUUID();
    const version = 1;

    for (const old of existingDecisions) {
      if (updatedRefs.has(old.decisionRef)) {
        continue;
      }

      const oldEmbedding = oldEmbeddingMap.get(old.id);
      if (oldEmbedding) {
        const similarity = cosineSimilarity(embedding, oldEmbedding);

        if (similarity >= 0.85) {
          decisionRef = old.decisionRef;
          updatedRefs.add(decisionRef);
          break;
        }
      }
    }

    const created = await tx.decision.create({
      data: {
        decisionRef:
          decisionRef as `${string}-${string}-${string}-${string}-${string}`,
        version,
        clientId,
        meetingId,
        title: d.title,
        content: d.content,
        rationale: d.rationale || null,
        evidence: d.evidence || null,
        status: "ACTIVE",
        tags: d.tags,
      },
    });

    const vectorStr = `[${embedding.join(",")}]`;
    await tx.$executeRawUnsafe(
      "UPDATE decisions SET embedding = $1::vector WHERE id = $2",
      vectorStr,
      created.id
    );
  }
}

export async function persistTasksTx(
  tx: Prisma.TransactionClient,
  clientId: string,
  meetingId: string,
  tasks: ExtractedTask[],
  resolveUserOrParticipant: (hint: string | undefined) => string | null,
  parseOptionalDate: (dateStr: string | undefined | null) => Date | null
): Promise<void> {
  for (const t of tasks) {
    const assigneeId = resolveUserOrParticipant(t.assigneeHint);
    await tx.task.create({
      data: {
        clientId,
        meetingId,
        title: t.title,
        description: t.description || null,
        assigneeId,
        priority: t.priority,
        dueAt: parseOptionalDate(t.dueAt),
        status: "OPEN",
      },
    });
  }
}

export async function persistOpenQuestionsTx(
  tx: Prisma.TransactionClient,
  clientId: string,
  meetingId: string,
  questions: ExtractedOpenQuestion[],
  resolveUserOrParticipant: (hint: string | undefined) => string | null,
  parseOptionalDate: (dateStr: string | undefined | null) => Date | null
): Promise<void> {
  for (const q of questions) {
    const assigneeId = resolveUserOrParticipant(q.assigneeHint);
    await tx.openQuestion.create({
      data: {
        clientId,
        meetingId,
        question: q.question,
        context: q.context || null,
        assigneeId,
        dueAt: parseOptionalDate(q.dueAt),
        status: "OPEN",
      },
    });
  }
}

export async function persistImportantPointsTx(
  tx: Prisma.TransactionClient,
  clientId: string,
  meetingId: string,
  pointsWithEmbeddings: Array<{
    p: ExtractedImportantPoint;
    embedding: number[];
  }>,
  resolveUserOrParticipant: (hint: string | undefined) => string | null
): Promise<void> {
  for (const { p, embedding } of pointsWithEmbeddings) {
    const speakerId = resolveUserOrParticipant(p.speakerHint);
    const created = await tx.importantPoint.create({
      data: {
        clientId,
        meetingId,
        speakerId,
        content: p.content,
        category: p.category,
        transcriptEvidence: p.transcriptEvidence || null,
      },
    });

    const vectorStr = `[${embedding.join(",")}]`;
    await tx.$executeRawUnsafe(
      "UPDATE important_points SET embedding = $1::vector WHERE id = $2",
      vectorStr,
      created.id
    );
  }
}

export async function persistCommitmentsTx(
  tx: Prisma.TransactionClient,
  clientId: string,
  meetingId: string,
  commitmentsWithEmbeddings: Array<{
    c: RedisCommitment;
    embedding: number[];
  }>,
  resolveUserOrParticipant: (hint: string | undefined) => string | null
): Promise<void> {
  for (const { c, embedding } of commitmentsWithEmbeddings) {
    const speakerId =
      c.speaker.userId || resolveUserOrParticipant(c.speaker.name);
    const created = await tx.importantPoint.create({
      data: {
        clientId,
        meetingId,
        speakerId,
        content: c.statement,
        category: "COMMITMENT",
        transcriptEvidence: c.utteranceId || null,
      },
    });

    if (embedding.length > 0) {
      const vectorStr = `[${embedding.join(",")}]`;
      await tx.$executeRawUnsafe(
        "UPDATE important_points SET embedding = $1::vector WHERE id = $2",
        vectorStr,
        created.id
      );
    }
  }
}
