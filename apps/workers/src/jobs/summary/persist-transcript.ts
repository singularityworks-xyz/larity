import { prisma } from "@larity/db/client";
import type { createWorkerLogger } from "../../logger";
import { generateEmbedding } from "./embeddings";

interface TranscriptUtterance {
  channel: number;
  duration: number; // in seconds
  speaker: string;
  text: string;
  timestamp: number; // in seconds
}

const WORD_SPLIT_REGEX = /\s+/;
const MIN_UTTERANCE_WORDS = 4;
const UTTERANCE_EMBED_BATCH = 20;

export async function persistUtterances(
  log: ReturnType<typeof createWorkerLogger>,
  clientId: string,
  meetingId: string,
  utterances: TranscriptUtterance[]
): Promise<void> {
  await prisma.transcriptUtterance.deleteMany({ where: { meetingId } });

  const eligible = utterances.filter(
    (u) => u.text.trim().split(WORD_SPLIT_REGEX).length >= MIN_UTTERANCE_WORDS
  );

  if (eligible.length === 0) {
    log.info({ meetingId }, "No eligible utterances for embedding");
    return;
  }

  log.info(
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
    log.info(
      { meetingId, batchIndex: i / UTTERANCE_EMBED_BATCH },
      "Utterance embedding batch complete"
    );
  }

  log.info(
    { meetingId, embeddedCount: rows.length },
    "Utterance embedding complete"
  );
}
