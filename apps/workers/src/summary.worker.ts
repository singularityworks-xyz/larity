import { randomUUID } from "node:crypto";
import { prisma } from "@larity/infra/prisma/client";
import type { SummaryJobData } from "@larity/jobs";
import type { Job } from "bullmq";
import { Prisma } from "../../../packages/infra/prisma/generated/prisma/client";
import { chunkUtterances } from "./lib/chunking";
import {
  getCommitmentEmbedding,
  getSessionCommitments,
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
import {
  cleanupMeetingStateKeys,
  publishMeetingProcessed,
  setJobStatus,
} from "./lib/job-status";
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

    await setJobStatus(sessionId, "summary", "processing");

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
        await setJobStatus(sessionId, "summary", "failed");
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
        await setJobStatus(sessionId, "summary", "failed");
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

      // 7. Date parsing helper
      const parseOptionalDate = (
        dateStr: string | undefined | null
      ): Date | null => {
        if (!dateStr) {
          return null;
        }
        const parsed = new Date(dateStr);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      };

      // 8. Pre-generate embeddings for decisions (network call outside transaction)
      const decisionsWithEmbeddings = await Promise.all(
        decisions.map(async (d) => {
          const text = `${d.title} ${d.content}`;
          const embedding = await generateEmbedding(text);
          return { d, embedding };
        })
      );

      // 9. Pre-generate embeddings for important points (network call outside transaction)
      const pointsWithEmbeddings = await Promise.all(
        importantPoints.map(async (p) => {
          const embedding = await generateEmbedding(p.content);
          return { p, embedding };
        })
      );

      // 10. Pre-generate embeddings for commitments (network call outside transaction)
      const commitmentsWithEmbeddings = await Promise.all(
        commitments.map(async (c) => {
          let embedding = getCommitmentEmbedding(c);
          if (embedding.length === 0) {
            embedding = await generateEmbedding(c.statement);
          }
          return { c, embedding };
        })
      );

      // 11. Generate meeting summary overview (network call outside transaction)
      let summaryText: string | null = null;
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
        summaryText = overviewResponse.text?.trim() || null;
      } catch (err) {
        this.log.error({ err }, "Failed to generate meeting summary overview");
      }

      // 12. Prisma transactional write (modularized to satisfy complexity limits)
      await prisma.$transaction(async (tx) => {
        // Query existing decisions and their embeddings in a single batch
        const existingDecisions = await tx.decision.findMany({
          where: { meetingId },
          orderBy: { version: "desc" },
        });

        const existingIds = existingDecisions.map((d) => d.id);
        const oldEmbeddings =
          existingIds.length > 0
            ? await tx.$queryRaw<{ id: string; embedding: string | null }[]>(
                Prisma.sql`SELECT id, embedding::text FROM decisions WHERE id IN (${Prisma.join(existingIds)})`
              )
            : [];

        const oldEmbeddingMap = new Map<string, number[]>();
        for (const row of oldEmbeddings) {
          if (row.embedding) {
            const values = row.embedding
              .replace(/[[\]]/g, "")
              .split(",")
              .map(Number);
            oldEmbeddingMap.set(row.id, values);
          }
        }

        await this.persistDecisionsTx(
          tx,
          meeting.clientId,
          meetingId,
          decisionsWithEmbeddings,
          existingDecisions,
          oldEmbeddingMap
        );

        // Delete old items for idempotency
        await tx.task.deleteMany({ where: { meetingId } });
        await tx.openQuestion.deleteMany({ where: { meetingId } });
        await tx.importantPoint.deleteMany({ where: { meetingId } });

        await this.persistTasksTx(
          tx,
          meeting.clientId,
          meetingId,
          tasks,
          resolveUserOrParticipant,
          parseOptionalDate
        );

        await this.persistOpenQuestionsTx(
          tx,
          meeting.clientId,
          meetingId,
          openQuestions,
          resolveUserOrParticipant,
          parseOptionalDate
        );

        await this.persistImportantPointsTx(
          tx,
          meeting.clientId,
          meetingId,
          pointsWithEmbeddings,
          resolveUserOrParticipant
        );

        await this.persistCommitmentsTx(
          tx,
          meeting.clientId,
          meetingId,
          commitmentsWithEmbeddings,
          resolveUserOrParticipant
        );

        // Update Meeting Summary
        if (summaryText) {
          await tx.meeting.update({
            where: { id: meetingId },
            data: { summary: summaryText },
          });
        }
      });

      this.log.info(
        { meetingId },
        "Insights extraction and persistence finished successfully"
      );

      // Write job status done, publish completed event, and clean up Redis keys
      await setJobStatus(sessionId, "summary", "done");
      await publishMeetingProcessed(meetingId, sessionId);
      await cleanupMeetingStateKeys(meetingId, sessionId);

      return { success: true };
    } catch (error) {
      this.log.error({ err: error, meetingId }, "Insights extraction failed");
      await setJobStatus(sessionId, "summary", "failed");
      throw error;
    }
  }

  private async persistDecisionsTx(
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
      let decisionRef = randomUUID();
      let version = 1;
      let matchedOldId: string | null = null;

      for (const old of existingDecisions) {
        if (updatedRefs.has(old.decisionRef)) {
          continue;
        }

        const oldEmbedding = oldEmbeddingMap.get(old.id);
        if (oldEmbedding) {
          const similarity = cosineSimilarity(embedding, oldEmbedding);

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

      const vectorStr = `[${embedding.join(",")}]`;
      await tx.$executeRawUnsafe(
        "UPDATE decisions SET embedding = $1::vector WHERE id = $2",
        vectorStr,
        created.id
      );
    }
  }

  private async persistTasksTx(
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

  private async persistOpenQuestionsTx(
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

  private async persistImportantPointsTx(
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

  private async persistCommitmentsTx(
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
}
