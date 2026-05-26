import { z } from "zod";

export const TranscribeJobSchema = z.object({
  sessionId: z.string(),
  orgId: z.string(),
  meetingId: z.string(),
  s3Prefix: z.string(),
});

export type TranscribeJobData = z.infer<typeof TranscribeJobSchema>;

export const SummaryJobSchema = z.object({
  sessionId: z.string(),
  orgId: z.string(),
  meetingId: z.string(),
});

export type SummaryJobData = z.infer<typeof SummaryJobSchema>;

export const AudioCleanupJobSchema = z.object({
  sessionId: z.string(),
  orgId: z.string(),
  s3Prefix: z.string(),
});

export type AudioCleanupJobData = z.infer<typeof AudioCleanupJobSchema>;
