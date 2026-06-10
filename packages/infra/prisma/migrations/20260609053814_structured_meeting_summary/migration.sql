/*
  Warnings:

  - The `summary` column on the `meetings` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- DropIndex
DROP INDEX "decisions_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "important_points_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "policy_guardrails_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "meetings" DROP COLUMN "summary",
ADD COLUMN     "summary" JSONB;

-- Recreate HNSW indexes dropped by the ALTER TABLE above
CREATE INDEX IF NOT EXISTS decisions_embedding_hnsw_idx
  ON decisions USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS important_points_embedding_hnsw_idx
  ON important_points USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS policy_guardrails_embedding_hnsw_idx
  ON policy_guardrails USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
