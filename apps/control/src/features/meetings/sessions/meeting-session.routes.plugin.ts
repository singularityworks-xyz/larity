import { createMeetingSessionRoutes } from "./meeting-session.routes";
import { meetingSessionService } from "./meeting-session.service";

export const meetingSessionRoutes = createMeetingSessionRoutes(
  meetingSessionService
);
