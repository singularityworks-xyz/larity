import { AIBriefGeneratorService } from "@larity/meeting-mode";
import { Elysia } from "elysia";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import {
  MeetingInsightsService,
  MeetingParticipantService,
  MeetingService,
  TranscriptService,
} from "../services";
import { ForbiddenError, NotFoundError } from "../services/meeting.service";
import type {
  MeetingInsightsQueryInput,
  MeetingQueryInput,
} from "../validators";
import {
  confirmSpeakerMappingSchema,
  createMeetingParticipantBaseSchema,
  createMeetingSchema,
  createTranscriptSchema,
  meetingExtractionSchema,
  meetingIdSchema,
  meetingInsightsQuerySchema,
  meetingParticipantIdSchema,
  meetingQuerySchema,
  updateMeetingParticipantSchema,
  updateMeetingSchema,
  updateTranscriptSchema,
} from "../validators";

export const meetingsRoutes = new Elysia({ prefix: "/meetings" })
  .use(requireAuth)
  // List all meetings (with optional filters)
  .get(
    "/",
    async ({ query }) => {
      const meetings = await MeetingService.findAll(
        query as unknown as MeetingQueryInput
      );
      return { success: true, data: meetings };
    },
    { query: meetingQuerySchema }
  )
  // Get meeting by id (includes tasks and decisions)
  .get(
    "/:id",
    async ({ params, set }) => {
      const meeting = await MeetingService.findById(params.id);
      if (!meeting) {
        set.status = 404;
        return { success: false, error: "Meeting not found" };
      }
      return { success: true, data: meeting };
    },
    { params: meetingIdSchema }
  )
  // Get meeting brief (dynamically generates for ad-hoc if missing)
  .get(
    "/:id/brief",
    async ({ params, user, set }) => {
      const meeting = await prisma.meeting.findUnique({
        where: { id: params.id },
        select: { preMeetingBrief: true },
      });
      if (!meeting) {
        set.status = 404;
        return { success: false, error: "Meeting not found" };
      }
      if (meeting.preMeetingBrief) {
        return { success: true, data: meeting.preMeetingBrief };
      }

      const brief = await AIBriefGeneratorService.generateAndSaveBrief(
        params.id,
        user?.id
      );

      if (!brief) {
        set.status = 500;
        return { success: false, error: "Failed to generate brief" };
      }

      return { success: true, data: brief };
    },
    { params: meetingIdSchema }
  )
  // Create meeting
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const meeting = await MeetingService.create(body);
        return { success: true, data: meeting };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2003") {
          set.status = 400;
          return { success: false, error: "Invalid client reference" };
        }
        throw e;
      }
    },
    { body: createMeetingSchema }
  )
  // Update meeting
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      try {
        const meeting = await MeetingService.update(params.id, body);
        return { success: true, data: meeting };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Meeting not found" };
        }
        throw e;
      }
    },
    { params: meetingIdSchema, body: updateMeetingSchema }
  )
  // Delete meeting
  .delete(
    "/:id",
    async ({ params, set }) => {
      try {
        await MeetingService.delete(params.id);
        return { success: true, message: "Meeting deleted" };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Meeting not found" };
        }
        throw e;
      }
    },
    { params: meetingIdSchema }
  )
  // Start meeting (transition to LIVE)
  .post(
    "/:id/start",
    async ({ params, set }) => {
      try {
        const meeting = await MeetingService.startMeeting(params.id);
        return { success: true, data: meeting };
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        if (err.code === "P2025" || err.message === "Meeting not found") {
          set.status = 404;
          return { success: false, error: "Meeting not found" };
        }
        throw e;
      }
    },
    { params: meetingIdSchema }
  )
  // End meeting (transition to ENDED)
  .post(
    "/:id/end",
    async ({ params, set }) => {
      try {
        const meeting = await MeetingService.endMeeting(params.id);
        return { success: true, data: meeting };
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        if (err.code === "P2025" || err.message === "Meeting not found") {
          set.status = 404;
          return { success: false, error: "Meeting not found" };
        }
        throw e;
      }
    },
    { params: meetingIdSchema }
  )
  // Cancel meeting
  .post(
    "/:id/cancel",
    async ({ params, set }) => {
      try {
        const meeting = await MeetingService.cancelMeeting(params.id);
        return { success: true, data: meeting };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Meeting not found" };
        }
        throw e;
      }
    },
    { params: meetingIdSchema }
  )
  // Bulk extraction (post-meeting AI processing)
  .post(
    "/:id/extract",
    async ({ params, body, set }) => {
      try {
        const result = await MeetingService.extractFromMeeting(params.id, body);
        return { success: true, data: result };
      } catch (e: unknown) {
        const err = e as Error;
        if (err.message === "Meeting not found") {
          set.status = 404;
          return { success: false, error: "Meeting not found" };
        }
        throw e;
      }
    },
    { params: meetingIdSchema, body: meetingExtractionSchema }
  )
  // --- Participants ---
  // Get meeting participants
  .get(
    "/:id/participants",
    async ({ params }) => {
      const participants = await MeetingParticipantService.findByMeeting(
        params.id
      );
      return { success: true, data: participants };
    },
    { params: meetingIdSchema }
  )
  // Add participant to meeting
  .post(
    "/:id/participants",
    async ({ params, body, set }) => {
      try {
        const participant = await MeetingParticipantService.create({
          meetingId: params.id,
          ...body,
        });
        return { success: true, data: participant };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2002") {
          set.status = 409;
          return { success: false, error: "User is already a participant" };
        }
        if (err.code === "P2003") {
          set.status = 400;
          return { success: false, error: "Invalid meeting or user reference" };
        }
        throw e;
      }
    },
    {
      params: meetingIdSchema,
      body: createMeetingParticipantBaseSchema.omit({ meetingId: true }),
    }
  )
  // Update participant
  .patch(
    "/participants/:id",
    async ({ params, body, set }) => {
      try {
        const participant = await MeetingParticipantService.update(
          params.id,
          body
        );
        return { success: true, data: participant };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Participant not found" };
        }
        throw e;
      }
    },
    { params: meetingParticipantIdSchema, body: updateMeetingParticipantSchema }
  )
  // Mark participant as attended
  .post(
    "/participants/:id/attended",
    async ({ params, set }) => {
      try {
        const participant = await MeetingParticipantService.markAttended(
          params.id
        );
        return { success: true, data: participant };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Participant not found" };
        }
        throw e;
      }
    },
    { params: meetingParticipantIdSchema }
  )
  // Remove participant
  .delete(
    "/participants/:id",
    async ({ params, set }) => {
      try {
        await MeetingParticipantService.remove(params.id);
        return { success: true, message: "Participant removed" };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Participant not found" };
        }
        throw e;
      }
    },
    { params: meetingParticipantIdSchema }
  )
  // --- Transcript ---
  // Get meeting transcript
  .get(
    "/:id/transcript",
    async ({ params, set }) => {
      const transcript = await TranscriptService.findByMeeting(params.id);
      if (!transcript) {
        set.status = 404;
        return { success: false, error: "Transcript not found" };
      }
      return { success: true, data: transcript };
    },
    { params: meetingIdSchema }
  )
  // Create transcript for meeting
  .post(
    "/:id/transcript",
    async ({ params, body, set }) => {
      try {
        const transcript = await TranscriptService.create({
          meetingId: params.id,
          ...body,
        });
        return { success: true, data: transcript };
      } catch (e: unknown) {
        const err = e as Error;
        if (err.message === "Transcript already exists for this meeting") {
          set.status = 409;
          return {
            success: false,
            error: "Transcript already exists for this meeting",
          };
        }
        const prismaErr = e as { code?: string };
        if (prismaErr.code === "P2003") {
          set.status = 400;
          return { success: false, error: "Invalid meeting reference" };
        }
        throw e;
      }
    },
    {
      params: meetingIdSchema,
      body: createTranscriptSchema.omit({ meetingId: true }),
    }
  )
  // Update transcript
  .patch(
    "/:id/transcript",
    async ({ params, body, set }) => {
      try {
        const transcript = await TranscriptService.findByMeeting(params.id);
        if (!transcript) {
          set.status = 404;
          return { success: false, error: "Transcript not found" };
        }
        const updated = await TranscriptService.update(transcript.id, body);
        return { success: true, data: updated };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Transcript not found" };
        }
        throw e;
      }
    },
    { params: meetingIdSchema, body: updateTranscriptSchema }
  )
  // Delete transcript
  .delete(
    "/:id/transcript",
    async ({ params, set }) => {
      try {
        const transcript = await TranscriptService.findByMeeting(params.id);
        if (!transcript) {
          set.status = 404;
          return { success: false, error: "Transcript not found" };
        }
        await TranscriptService.delete(transcript.id);
        return { success: true, message: "Transcript deleted" };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Transcript not found" };
        }
        throw e;
      }
    },
    { params: meetingIdSchema }
  )
  // Get processing status of meeting
  .get(
    "/:id/processing-status",
    async ({ params, set }) => {
      const status = await MeetingService.getProcessingStatus(params.id);
      if (!status) {
        set.status = 404;
        return { success: false, error: "Meeting not found" };
      }
      return { success: true, data: status };
    },
    { params: meetingIdSchema }
  )
  // Trigger reprocessing of meeting insights
  .post(
    "/:id/reprocess",
    async ({ params, set }) => {
      try {
        const result = await MeetingService.reprocessMeeting(params.id);
        return { success: true, data: result };
      } catch (error) {
        set.status = 400;
        return {
          success: false,
          error: error instanceof Error ? error.message : "Reprocessing failed",
        };
      }
    },
    { params: meetingIdSchema }
  )
  // Get aggregated insights for meeting
  .get(
    "/:id/insights",
    async ({ params, query }) => {
      const insights = await MeetingInsightsService.getInsights(
        params.id,
        query as unknown as MeetingInsightsQueryInput
      );
      return { success: true, data: insights };
    },
    {
      params: meetingIdSchema,
      query: meetingInsightsQuerySchema,
    }
  )
  // Confirm speaker mapping deduction
  .post(
    "/:id/speaker-mappings",
    async ({ params, body, set }) => {
      try {
        const deepgramIndex = body.deepgramIndex ?? body.index;
        if (!deepgramIndex) {
          set.status = 400;
          return {
            success: false,
            error: "Either deepgramIndex or index is required",
          };
        }
        const result = await MeetingService.confirmSpeakerMapping(
          params.id,
          deepgramIndex,
          body.clientMemberId
        );
        return { success: true, data: result };
      } catch (e: unknown) {
        if (e instanceof NotFoundError) {
          set.status = 404;
          return { success: false, error: e.message };
        }
        if (e instanceof ForbiddenError) {
          set.status = 403;
          return { success: false, error: e.message };
        }
        const err = e as { code?: string; message?: string };
        if (err.message === "Meeting not found") {
          set.status = 404;
          return { success: false, error: "Meeting not found" };
        }
        throw e;
      }
    },
    { params: meetingIdSchema, body: confirmSpeakerMappingSchema }
  );
