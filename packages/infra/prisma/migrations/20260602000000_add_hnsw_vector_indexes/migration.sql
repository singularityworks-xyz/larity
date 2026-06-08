-- Create HNSW indexes using vector_cosine_ops on embedding columns
-- Note: In production PostgreSQL environments, creating index concurrently is recommended.
-- However, CREATE INDEX CONCURRENTLY cannot run inside a transaction block (which Prisma uses by default).
-- For safety, we use CREATE INDEX (non-concurrent) here to ensure standard migration flows work seamlessly.

-- Enable pgvector if not already enabled (this is a precaution)
CREATE EXTENSION IF NOT EXISTS vector;

-- HNSW index on decisions.embedding
CREATE INDEX IF NOT EXISTS decisions_embedding_hnsw_idx
  ON decisions
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- HNSW index on important_points.embedding
CREATE INDEX IF NOT EXISTS important_points_embedding_hnsw_idx
  ON important_points
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- HNSW index on policy_guardrails.embedding
CREATE INDEX IF NOT EXISTS policy_guardrails_embedding_hnsw_idx
  ON policy_guardrails
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
