import { randomUUID } from "node:crypto";
import { prisma } from "@larity/infra/prisma/client";
import type { SummaryJobData } from "@larity/jobs";
import type { Prisma } from "@prisma/client";
import type { Job } from "bullmq";
import { chunkUtterances } from "./lib/chunking";
import {
  getCommitmentEmbedding,
  getSessionCommitments,
  type RedisCommitment,
} from "./lib/commitments";
import { cosineSimilarity, deduplicateItems } from "./lib/deduplication";
import { generateEmbedding } from "./lib/embeddings";
import {
  EXTRACTION_MODEL,
  type ExtractedDecision,
  type ExtractedImportantPoint,
  type ExtractedOpenQuestion,
  type ExtractedTask,
  extractInsightsFromTranscriptChunk,
} from "./lib/extraction-llm";
import { ai } from "./lib/gemini";
import { BaseWorker } from "./worker";

interface Utterance {
  id: string;
  speaker: string;
  text: string;
  timestamp: number; // in seconds
  duration: number; // in seconds
  channel: number;
}

export class SummaryWorker extends BaseWorker<
  SummaryJobData,
  { success: boolean }
> {
  constructor() {
    super("meeting.summary");
  }

  protected async process(
    job: Job<SummaryJobData, { success: boolean }>
  ): Promise<{ success: boolean }> {
    const { meetingId, sessionId, orgId } = job.data;

    this.log.info(
      { meetingId, sessionId },
      "Starting post-meeting insights extraction"
    );

    try {
      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        include: {
          participants: {
            include: {
              user: true,
            },
          },
          client: true,
        },
      });

      if (!meeting) {
        throw new Error(`Meeting not found for ID: ${meetingId}`);
      }

      const transcript = await prisma.transcript.findUnique({
        where: { meetingId },
      });

      if (!transcript) {
        this.log.warn(
          { meetingId },
          "No transcript found for meeting, extraction skipped"
        );
        return { success: false };
      }

      let utterances: Utterance[] = [];
      try {
        utterances = JSON.parse(transcript.content);
      } catch (err) {
        throw new Error(
          `Failed to parse transcript content JSON: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      if (!Array.isArray(utterances) || utterances.length === 0) {
        this.log.warn(
          { meetingId },
          "Transcript content is empty, extraction skipped"
        );
        return { success: false };
      }

      utterances.sort((a, b) => a.timestamp - b.timestamp);

      // 2. Chunk transcript (15-min windows, 2-min overlaps)
      const WINDOW_SIZE_SEC = 15 * 60; // 900s
      const OVERLAP_SEC = 2 * 60; // 120s
      const chunks = chunkUtterances(utterances, WINDOW_SIZE_SEC, OVERLAP_SEC);

      this.log.info(
        {
          meetingId,
          totalUtterances: utterances.length,
          numChunks: chunks.length,
        },
        "Chunked transcript for extraction"
      );

      // 3. Extract raw items from chunks
      const participantNames = meeting.participants
        .map((p) => p.user?.name || p.externalName)
        .filter(Boolean)
        .join(", ");
      const contextMetadata = `Meeting Title: ${meeting.title}\nClient: ${meeting.client.name}\nParticipants: ${participantNames}`;

      const rawDecisions: ExtractedDecision[] = [];
      const rawTasks: ExtractedTask[] = [];
      const rawQuestions: ExtractedOpenQuestion[] = [];
      const rawPoints: ExtractedImportantPoint[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) {
          continue;
        }
        const chunkText = chunk
          .map((u) => `[${u.speaker}]: ${u.text}`)
          .join("\n");
        this.log.info(
          { meetingId, chunkIndex: i },
          `Extracting insights from chunk ${i + 1}/${chunks.length}`
        );

        try {
          const result = await extractInsightsFromTranscriptChunk(
            chunkText,
            contextMetadata
          );
          rawDecisions.push(...result.decisions);
          rawTasks.push(...result.tasks);
          rawQuestions.push(...result.openQuestions);
          rawPoints.push(...result.importantPoints);
        } catch (error) {
          this.log.error(
            { err: error, chunkIndex: i },
            `Failed to extract insights from chunk ${i}`
          );
        }
      }

      // 4. Deduplicate items
      this.log.info(
        { meetingId },
        "Starting deduplication of extracted insights"
      );
      const decisions = await deduplicateItems(
        rawDecisions.map((d) => ({
          ...d,
          textToEmbed: `${d.title} ${d.content}`,
        }))
      );
      const tasks = await deduplicateItems(
        rawTasks.map((t) => ({
          ...t,
          textToEmbed: `${t.title} ${t.description || ""}`,
        }))
      );
      const openQuestions = await deduplicateItems(
        rawQuestions.map((q) => ({ ...q, textToEmbed: q.question }))
      );
      const importantPoints = await deduplicateItems(
        rawPoints.map((p) => ({ ...p, textToEmbed: p.content }))
      );

      this.log.info(
        {
          decisions: decisions.length,
          tasks: tasks.length,
          questions: openQuestions.length,
          points: importantPoints.length,
        },
        "Deduplication completed"
      );

      // 5. Retrieve commitments from ledger
      this.log.info({ sessionId }, "Fetching commitments from ledger");
      const commitments = await getSessionCommitments(orgId, sessionId);
      this.log.info(
        { sessionId, numCommitments: commitments.length },
        "Retrieved commitments"
      );

      // 6. Name resolution helper
      const resolveUserOrParticipant = (
        hint: string | undefined
      ): string | null => {
        if (!hint) {
          return null;
        }
        const cleaned = hint.trim().toLowerCase();
        for (const p of meeting.participants) {
          if (p.user && p.user.name.toLowerCase() === cleaned) {
            return p.user.id;
          }
        }
        return null;
      };

      // 7. Prisma transactional write (modularized to satisfy complexity limits)
      await prisma.$transaction(async (tx) => {
        await this.persistDecisions(tx, meeting.clientId, meetingId, decisions);

        // Delete old items for idempotency
        await tx.task.deleteMany({ where: { meetingId } });
        await tx.openQuestion.deleteMany({ where: { meetingId } });
        await tx.importantPoint.deleteMany({ where: { meetingId } });

        await this.persistTasks(
          tx,
          meeting.clientId,
          meetingId,
          tasks,
          resolveUserOrParticipant
        );
        await this.persistOpenQuestions(
          tx,
          meeting.clientId,
          meetingId,
          openQuestions,
          resolveUserOrParticipant
        );
        await this.persistImportantPoints(
          tx,
          meeting.clientId,
          meetingId,
          importantPoints,
          resolveUserOrParticipant
        );
        await this.persistCommitments(
          tx,
          meeting.clientId,
          meetingId,
          commitments,
          resolveUserOrParticipant
        );

        await this.updateMeetingSummary(tx, meetingId, utterances);
      });

      this.log.info(
        { meetingId },
        "Insights extraction and persistence finished successfully"
      );
      return { success: true };
    } catch (error) {
      this.log.error({ err: error, meetingId }, "Insights extraction failed");
      throw error;
    }
  }

  /**
   * Deduplicates, versions, and saves decisions.
   */
  private async persistDecisions(
    tx: Prisma.TransactionClient,
    clientId: string,
    meetingId: string,
    decisions: ExtractedDecision[]
  ): Promise<void> {
    const existing = await tx.decision.findMany({
      where: { meetingId },
      orderBy: { version: "desc" },
    });

    const updatedRefs = new Set<string>();

    for (const d of decisions) {
      let decisionRef = randomUUID();
      let version = 1;
      let matchedOldId: string | null = null;

      const currentText = `${d.title} ${d.content}`;
      const currentEmbedding = await generateEmbedding(currentText);

      for (const old of existing) {
        if (updatedRefs.has(old.decisionRef)) {
          continue;
        }

        const oldEmbeddingResult = await tx.$queryRaw`
          SELECT embedding::text FROM decisions WHERE id = ${old.id} LIMIT 1;
        `;
        const rawVector = oldEmbeddingResult[0]?.embedding;
        if (rawVector) {
          const oldEmbedding = rawVector
            .replace(/[[\]]/g, "")
            .split(",")
            .map(Number);
          const similarity = cosineSimilarity(currentEmbedding, oldEmbedding);

          if (similarity >= 0.85) {
            decisionRef = old.decisionRef;
            version = old.version + 1;
            matchedOldId = old.id;
            updatedRefs.add(decisionRef);
            break;
          }
        }
      }

      if (matchedOldId) {
        await tx.decision.update({
          where: { id: matchedOldId },
          data: { status: "SUPERSEDED" },
        });
      }

      const created = await tx.decision.create({
        data: {
          decisionRef,
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

      const vectorStr = `[${currentEmbedding.join(",")}]`;
      await tx.$executeRawUnsafe(
        "UPDATE decisions SET embedding = $1::vector WHERE id = $2",
        vectorStr,
        created.id
      );
    }
  }

  /**
   * Persists extracted tasks.
   */
  private async persistTasks(
    tx: Prisma.TransactionClient,
    clientId: string,
    meetingId: string,
    tasks: ExtractedTask[],
    resolver: (hint: string | undefined) => string | null
  ): Promise<void> {
    for (const t of tasks) {
      const assigneeId = resolver(t.assigneeHint);
      await tx.task.create({
        data: {
          clientId,
          meetingId,
          title: t.title,
          description: t.description || null,
          assigneeId,
          priority: t.priority,
          dueAt: t.dueAt ? new Date(t.dueAt) : null,
          status: "OPEN",
        },
      });
    }
  }

  /**
   * Persists open questions.
   */
  private async persistOpenQuestions(
    tx: Prisma.TransactionClient,
    clientId: string,
    meetingId: string,
    questions: ExtractedOpenQuestion[],
    resolver: (hint: string | undefined) => string | null
  ): Promise<void> {
    for (const q of questions) {
      const assigneeId = resolver(q.assigneeHint);
      await tx.openQuestion.create({
        data: {
          clientId,
          meetingId,
          question: q.question,
          context: q.context || null,
          assigneeId,
          dueAt: q.dueAt ? new Date(q.dueAt) : null,
          status: "OPEN",
        },
      });
    }
  }

  /**
   * Persists important points.
   */
  private async persistImportantPoints(
    tx: Prisma.TransactionClient,
    clientId: string,
    meetingId: string,
    points: ExtractedImportantPoint[],
    resolver: (hint: string | undefined) => string | null
  ): Promise<void> {
    for (const p of points) {
      const speakerId = resolver(p.speakerHint);
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

      const embedding = await generateEmbedding(p.content);
      const vectorStr = `[${embedding.join(",")}]`;
      await tx.$executeRawUnsafe(
        "UPDATE important_points SET embedding = $1::vector WHERE id = $2",
        vectorStr,
        created.id
      );
    }
  }

  /**
   * Persists Redis commitments as ImportantPoint entries.
   */
  private async persistCommitments(
    tx: Prisma.TransactionClient,
    clientId: string,
    meetingId: string,
    commitments: RedisCommitment[],
    resolver: (hint: string | undefined) => string | null
  ): Promise<void> {
    for (const c of commitments) {
      const speakerId = c.speaker.userId || resolver(c.speaker.name);
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

      let embedding = getCommitmentEmbedding(c);
      if (embedding.length === 0) {
        embedding = await generateEmbedding(c.statement);
      }

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

  /**
   * Generates a meeting summary overview and updates the meeting record.
   */
  private async updateMeetingSummary(
    tx: Prisma.TransactionClient,
    meetingId: string,
    utterances: Utterance[]
  ): Promise<void> {
    const overviewPrompt = `Draft a concise 2-3 sentence overview summary of the meeting based on the following transcript segments:\n\n${utterances
      .slice(0, 10)
      .map((u) => `[${u.speaker}]: ${u.text}`)
      .join("\n")}\n...\n${utterances
      .slice(-10)
      .map((u) => `[${u.speaker}]: ${u.text}`)
      .join("\n")}`;

    try {
      const overviewResponse = await ai.models.generateContent({
        model: EXTRACTION_MODEL,
        contents: overviewPrompt,
        config: {
          temperature: 0.2,
        },
      });
      const summaryText = overviewResponse.text?.trim() || null;
      if (summaryText) {
        await tx.meeting.update({
          where: { id: meetingId },
          data: { summary: summaryText },
        });
      }
    } catch (err) {
      this.log.error({ err }, "Failed to generate meeting summary overview");
    }
  }
}
