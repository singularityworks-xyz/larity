import { Elysia } from "elysia";
import {
  MeetingParticipantService,
  MeetingService,
  TranscriptService,
} from "../services";
import {
  createMeetingParticipantBaseSchema,
  createMeetingSchema,
  createTranscriptSchema,
  meetingExtractionSchema,
  meetingIdSchema,
  meetingParticipantIdSchema,
  meetingQuerySchema,
  updateMeetingParticipantSchema,
  updateMeetingSchema,
  updateTranscriptSchema,
} from "../validators";

export const meetingsRoutes = new Elysia({ prefix: "/meetings" })
  // List all meetings (with optional filters)
  .get(
    "/",
    async ({ query }) => {
      const meetings = await MeetingService.findAll(query);
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
  );
