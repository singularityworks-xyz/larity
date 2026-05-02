import { SpeakerIdentifier } from "./packages/meeting-mode/src/speaker/identifier";

const identifier = new SpeakerIdentifier("test-session");
identifier.registerTeamMember("user-alice", "Alice");
const now = Date.now();
identifier.processVadSignal({
  type: "vad_speaking",
  userId: "user-alice",
  sessionId: "test-session",
  clientSendTs: now - 500,
  serverReceiveTs: now - 500,
});
identifier.identifySpeaker(0, 1, now);
console.log("getAllMappings", identifier.getAllMappings());
console.log("getSpeakerMapping", identifier.getSpeakerMapping(0));
