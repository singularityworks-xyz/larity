import { z } from "zod";

export const TranscribeJobSchema = z.object({
  sessionId: z.string().min(1),
  orgId: z.string().min(1),
  meetingId: z.string().min(1),
  s3Prefix: z.string().min(1),
});

export type TranscribeJobData = z.infer<typeof TranscribeJobSchema>;

export const SummaryJobSchema = z.object({
  sessionId: z.string().min(1),
  orgId: z.string().min(1),
  meetingId: z.string().min(1),
});

export type SummaryJobData = z.infer<typeof SummaryJobSchema>;

export const AudioCleanupJobSchema = z.object({
  sessionId: z.string().min(1),
  orgId: z.string().min(1),
  s3Prefix: z.string().min(1),
});

export type AudioCleanupJobData = z.infer<typeof AudioCleanupJobSchema>;

export const ClientPersonaJobSchema = z.object({
  clientMemberId: z.string().min(1),
  meetingId: z.string().min(1),
});

export type ClientPersonaJobData = z.infer<typeof ClientPersonaJobSchema>;

export const PreMeetingBriefJobSchema = z.object({
  meetingId: z.string().min(1),
});

export type PreMeetingBriefJobData = z.infer<typeof PreMeetingBriefJobSchema>;
