import { randomUUID } from "node:crypto";
import { prisma } from "@larity/db/client";
import type { MeetingAnalysis } from "@larity/db/meeting-analysis.types";
import { Prisma } from "@larity/db/prisma";
import type { SummaryJobData } from "@larity/jobs";
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
  type ExtractedDecision,
  type ExtractedImportantPoint,
  type ExtractedOpenQuestion,
  type ExtractedTask,
  extractInsightsFromTranscriptChunk,
} from "./lib/extraction-llm";
import { generateMeetingAnalysis } from "./lib/final-analysis-llm";
import {
  cleanupMeetingStateKeys,
  publishMeetingProcessed,
  setJobStatus,
} from "./lib/job-status";
import { computeTalkTime } from "./lib/talk-time";
import { BaseWorker } from "./worker";

interface Utterance {
  channel: number;
  duration: number; // in seconds
  id: string;
  speaker: string;
  text: string;
  timestamp: number; // in seconds
  type?: "TEAM" | "EXTERNAL";
}

const SPEAKER_LABEL_CLEANUP_REGEX = /\s*-\s*\d+$/;
const WORD_SPLIT_REGEX = /\s+/;
const MIN_UTTERANCE_WORDS = 4;
const UTTERANCE_EMBED_BATCH = 20;

type MeetingWithRelations = Prisma.MeetingGetPayload<{
  include: {
    participants: {
      include: {
        user: true;
      };
    };
    client: true;
  };
}>;

export class SummaryWorker extends BaseWorker<
  SummaryJobData,
  { success: boolean }
> {
  constructor() {
    super("meeting.summary");
  }

  private async generateMeetingAnalysisWrapper(
    meeting: MeetingWithRelations,
    utterances: Utterance[],
    decisions: ExtractedDecision[],
    tasks: ExtractedTask[],
    openQuestions: ExtractedOpenQuestion[],
    importantPoints: ExtractedImportantPoint[],
    commitments: RedisCommitment[]
  ): Promise<MeetingAnalysis | null> {
    try {
      const durationSeconds =
        meeting.endedAt && meeting.startedAt
          ? Math.round(
              (meeting.endedAt.getTime() - meeting.startedAt.getTime()) / 1000
            )
          : 0;

      const talkTimeStats = computeTalkTime(utterances);
      const speakerRolesFromUtterances = new Map<
        string,
        "TEAM_MEMBER" | "EXTERNAL"
      >();
      for (const u of utterances) {
        if (u.type) {
          const roleVal = u.type === "TEAM" ? "TEAM_MEMBER" : "EXTERNAL";
          speakerRolesFromUtterances.set(
            u.speaker.toLowerCase().trim(),
            roleVal
          );
        }
      }

      const participantsForLLM = meeting.participants.map((p) => {
        const name = p.user?.name || p.externalName || "Unknown";
        const cleanName = name.toLowerCase().trim();
        let role: "TEAM_MEMBER" | "EXTERNAL" = p.userId
          ? ("TEAM_MEMBER" as const)
          : ("EXTERNAL" as const);

        const overrideRole = speakerRolesFromUtterances.get(cleanName);
        if (overrideRole) {
          role = overrideRole;
        }

        return { name, role };
      });

      const partialAnalysis = await generateMeetingAnalysis({
        meetingTitle: meeting.title,
        clientName: meeting.client.name,
        participants: participantsForLLM,
        decisions,
        tasks,
        openQuestions,
        importantPoints,
        talkTimeStats,
        durationSeconds,
        utterances,
      });

      // Compute speaker stats using talkTimeStats, commitments and open questions counts
      const commitmentCounts: Record<string, number> = {};
      for (const c of commitments) {
        const name = c.speaker.name || "Unknown";
        commitmentCounts[name] = (commitmentCounts[name] || 0) + 1;
      }

      const questionCounts: Record<string, number> = {};
      for (const q of openQuestions) {
        const name = q.assigneeHint || "Unknown";
        questionCounts[name] = (questionCounts[name] || 0) + 1;
      }

      const speakers: MeetingAnalysis["speakers"] = Object.entries(
        talkTimeStats
      ).map(([speakerLabel, stats]) => {
        const participant = meeting.participants.find((p) => {
          const pName = (p.user?.name || p.externalName || "").toLowerCase();
          const sClean = speakerLabel
            .replace(SPEAKER_LABEL_CLEANUP_REGEX, "")
            .toLowerCase()
            .trim();

          if (pName === sClean) {
            return true;
          }
          if (sClean.length >= 5 && pName.startsWith(sClean)) {
            return true;
          }
          if (pName.length >= 5 && sClean.startsWith(pName)) {
            return true;
          }
          return false;
        });

        let role: "TEAM_MEMBER" | "EXTERNAL" | "UNKNOWN" = "UNKNOWN";
        const uClean = speakerLabel
          .replace(SPEAKER_LABEL_CLEANUP_REGEX, "")
          .toLowerCase()
          .trim();
        const uttType = utterances.find(
          (u) => u.speaker.toLowerCase().trim() === uClean
        )?.type;

        if (uttType) {
          role = uttType === "TEAM" ? "TEAM_MEMBER" : "EXTERNAL";
        } else if (participant) {
          role = participant.userId ? "TEAM_MEMBER" : "EXTERNAL";
        }

        return {
          speakerLabel,
          participantId: participant?.userId || undefined,
          name:
            participant?.user?.name ||
            participant?.externalName ||
            speakerLabel,
          role,
          talkTimePercent: stats.talkTimePercent,
          utteranceCount: stats.utteranceCount,
          commitmentCount:
            commitmentCounts[
              participant?.user?.name || participant?.externalName || ""
            ] || 0,
          assignedQuestionCount:
            questionCounts[
              participant?.user?.name || participant?.externalName || ""
            ] || 0,
        };
      });

      return {
        ...partialAnalysis,
        speakers,
        durationSeconds,
        participantCount: meeting.participants.length,
        generatedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.log.error({ err }, "Failed to generate structured meeting analysis");
      return null;
    }
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
          throw error;
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

      // 11. Generate structured meeting analysis (Tier 3 network call outside transaction)
      const analysis = await this.generateMeetingAnalysisWrapper(
        meeting,
        utterances,
        decisions,
        tasks,
        openQuestions,
        importantPoints,
        commitments
      );

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

        // Delete old items for idempotency
        await tx.decision.deleteMany({ where: { meetingId } });
        await tx.task.deleteMany({ where: { meetingId } });
        await tx.openQuestion.deleteMany({ where: { meetingId } });
        await tx.importantPoint.deleteMany({ where: { meetingId } });

        await this.persistDecisionsTx(
          tx,
          meeting.clientId,
          meetingId,
          decisionsWithEmbeddings,
          existingDecisions,
          oldEmbeddingMap
        );

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
        if (analysis) {
          await tx.meeting.update({
            where: { id: meetingId },
            data: { summary: analysis as unknown as Prisma.InputJsonValue },
          });
        }
      });

      this.log.info(
        { meetingId },
        "Insights extraction and persistence finished successfully"
      );

      // 13. Tier 4: Persist and embed raw utterances for Assistant RAG (outside main transaction)
      try {
        await this.persistUtterances(meeting.clientId, meetingId, utterances);
      } catch (err) {
        this.log.error(
          { err, meetingId },
          "Failed to embed and persist utterances for Assistant"
        );
        // Non-fatal, do not throw
      }

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

  private async persistUtterances(
    clientId: string,
    meetingId: string,
    utterances: Utterance[]
  ): Promise<void> {
    await prisma.transcriptUtterance.deleteMany({ where: { meetingId } });

    const eligible = utterances.filter(
      (u) => u.text.trim().split(WORD_SPLIT_REGEX).length >= MIN_UTTERANCE_WORDS
    );

    if (eligible.length === 0) {
      this.log.info({ meetingId }, "No eligible utterances for embedding");
      return;
    }

    this.log.info(
      {
        meetingId,
        totalUtterances: utterances.length,
        eligible: eligible.length,
      },
      "Embedding utterances for assistant compatibility"
    );

    const rows = await Promise.all(
      eligible.map((u) =>
        prisma.transcriptUtterance.create({
          data: {
            meetingId,
            clientId,
            speaker: u.speaker,
            text: u.text,
            timestamp: u.timestamp,
            duration: u.duration,
            channel: u.channel,
          },
        })
      )
    );

    for (let i = 0; i < rows.length; i += UTTERANCE_EMBED_BATCH) {
      const batch = rows.slice(i, i + UTTERANCE_EMBED_BATCH);
      await Promise.all(
        batch.map(async (row) => {
          const embedding = await generateEmbedding(row.text);
          const vectorStr = `[${embedding.join(",")}]`;
          await prisma.$executeRawUnsafe(
            "UPDATE transcript_utterances SET embedding = $1::vector WHERE id = $2",
            vectorStr,
            row.id
          );
        })
      );
      this.log.info(
        { meetingId, batchIndex: i / UTTERANCE_EMBED_BATCH },
        "Utterance embedding batch complete"
      );
    }

    this.log.info(
      { meetingId, embeddedCount: rows.length },
      "Utterance embedding complete"
    );
  }
}
