import { getRedisClient } from "@larity/db/redis";
import { redisKeys } from "@larity/db/redis/keys";
import {
  createS3Client,
  GetObjectCommand,
  getS3Config,
} from "@larity/infra/s3";
import { unpackEmbeddingFromBase64 } from "meeting-mode";

export interface RedisCommitment {
  embedding?: number[];
  embeddingBase64?: string;
  id: string;
  normalizedStatement?: string;
  speaker: {
    userId?: string;
    speakerId: string;
    name?: string;
    type: "TEAM" | "EXTERNAL";
  };
  statement: string;
  status: string;
  timestamp: number;
  topicId: string;
  type: string;
  utteranceId: string;
}

/**
 * Downloads session_state.json from S3 and extracts commitments.
 */
async function getCommitmentsFromS3(
  orgId: string,
  sessionId: string
): Promise<RedisCommitment[] | null> {
  const s3 = createS3Client();
  const config = getS3Config();
  const key = `${orgId}/${sessionId}/session_state.json`;

  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      })
    );

    if (!response.Body) {
      return null;
    }

    const bytes = await response.Body.transformToByteArray();
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return Array.isArray(payload.commitments) ? payload.commitments : null;
  } catch (error) {
    console.warn(`Failed to retrieve commitments from S3 (${key}):`, error);
    return null;
  } finally {
    s3.destroy();
  }
}

/**
 * Retrieves the commitments for a meeting session, checking Redis with a fallback to S3.
 */
export async function getSessionCommitments(
  orgId: string,
  sessionId: string
): Promise<RedisCommitment[]> {
  const redis = getRedisClient();

  // 1. Try meetingCommitment key in Redis
  try {
    const raw = await redis.get(redisKeys.meetingCommitment(sessionId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn("Failed to read meetingCommitment from Redis:", error);
  }

  // 2. Try meetingLedgerSnapshot key in Redis
  try {
    const raw = await redis.get(redisKeys.meetingLedgerSnapshot(sessionId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.commitments)) {
        return parsed.commitments;
      }
    }
  } catch (error) {
    console.warn("Failed to read meetingLedgerSnapshot from Redis:", error);
  }

  // 3. Fall back to S3 session_state.json
  const s3Commitments = await getCommitmentsFromS3(orgId, sessionId);
  if (s3Commitments) {
    return s3Commitments;
  }

  return [];
}

/**
 * Unpacks the embedding of a commitment if stored as base64, returning a 768-dim number[].
 */
export function getCommitmentEmbedding(commitment: RedisCommitment): number[] {
  if (Array.isArray(commitment.embedding) && commitment.embedding.length > 0) {
    return commitment.embedding;
  }
  if (commitment.embeddingBase64) {
    try {
      return unpackEmbeddingFromBase64(commitment.embeddingBase64);
    } catch (error) {
      console.error("Failed to unpack commitment embedding base64:", error);
    }
  }
  return [];
}
