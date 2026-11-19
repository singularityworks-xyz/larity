import { z } from "zod";

export const TranscriptFormat = z.enum(["RAW", "NORMALIZED", "STRUCTURED"]);
export type TranscriptFormat = z.infer<typeof TranscriptFormat>;

export const transcriptIdSchema = z.object({
  id: z.uuid("Invalid transcript ID"),
});

export const transcriptMeetingIdSchema = z.object({
  meetingId: z.uuid("Invalid meeting ID"),
});

export const createTranscriptSchema = z.object({
  meetingId: z.uuid("Invalid meeting ID"),
  content: z.string().min(1, "Content is required"),
  format: TranscriptFormat.default("RAW"),
  duration: z.number().int().positive().optional(),
  wordCount: z.number().int().positive().optional(),
});

export const updateTranscriptSchema = z.object({
  content: z.string().min(1).optional(),
  format: TranscriptFormat.optional(),
  duration: z.number().int().positive().optional(),
  wordCount: z.number().int().positive().optional(),
});

export type CreateTranscriptInput = z.infer<typeof createTranscriptSchema>;
export type UpdateTranscriptInput = z.infer<typeof updateTranscriptSchema>;
