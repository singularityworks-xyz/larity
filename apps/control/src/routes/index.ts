// Core identity
// biome-ignore lint/performance/noBarrelFile: structure convention
export { authRoutes } from "./auth.routes";
export { clientsRoutes } from "./clients.routes";
// Decisions & tasks
export { decisionsRoutes } from "./decisions.routes";
// Documents & reminders
export { documentsRoutes } from "./documents.routes";
export { importantPointsRoutes } from "./important-points.routes";
export { internalSessionRoutes } from "./internal-session.routes";
export { meetingSessionRoutes } from "./meeting-session.routes";
// Meeting domain
export { meetingsRoutes } from "./meetings.routes";
export { openQuestionsRoutes } from "./open-questions.routes";
export { orgsRoutes } from "./orgs.routes";
// Policy & compliance
export { policyGuardrailsRoutes } from "./policy-guardrails.routes";
export { privacyComplianceRoutes } from "./privacy-compliance.routes";
// Context & search
export { semanticSearchRoutes } from "./semantic-search.routes";
export { userContextRoutes } from "./user-context.routes";
export { workspacesRoutes } from "./workspaces.routes";
