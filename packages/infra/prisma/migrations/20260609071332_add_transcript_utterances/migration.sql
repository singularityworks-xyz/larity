

-- CreateTable
CREATE TABLE "transcript_utterances" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "speaker" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "timestamp" DOUBLE PRECISION NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "channel" INTEGER NOT NULL DEFAULT 0,
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcript_utterances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transcript_utterances_meetingId_idx" ON "transcript_utterances"("meetingId");

-- CreateIndex
CREATE INDEX "transcript_utterances_clientId_idx" ON "transcript_utterances"("clientId");

-- CreateIndex
CREATE INDEX "transcript_utterances_speaker_idx" ON "transcript_utterances"("speaker");

-- AddForeignKey
ALTER TABLE "transcript_utterances" ADD CONSTRAINT "transcript_utterances_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_utterances" ADD CONSTRAINT "transcript_utterances_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create HNSW Index
CREATE INDEX "transcript_utterances_embedding_hnsw_idx" ON "transcript_utterances" USING hnsw ("embedding" vector_cosine_ops);
