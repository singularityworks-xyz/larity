import type { AgendaCheckInput, SpeakerStateAlert } from "./types";
import { DEFAULT_SPEAKER_STATE_CONFIG } from "./types";

export function checkUndiscussedAgenda(
  input: AgendaCheckInput,
  _config = DEFAULT_SPEAKER_STATE_CONFIG
): SpeakerStateAlert | null {
  if (input.agendaItems.length === 0) {
    return null;
  }

  const normalizedDiscussed = input.discussedTopicLabels.map((label) =>
    label.toLowerCase().trim()
  );

  const missingItems: string[] = [];

  for (const agendaItem of input.agendaItems) {
    const normalizedAgenda = agendaItem.toLowerCase().trim();
    const isDiscussed = normalizedDiscussed.some(
      (discussed) =>
        discussed.includes(normalizedAgenda) ||
        normalizedAgenda.includes(discussed)
    );

    if (!isDiscussed) {
      missingItems.push(agendaItem);
    }
  }

  if (missingItems.length === 0) {
    return null;
  }

  const alert: SpeakerStateAlert = {
    category: "undiscussed_agenda",
    severity: missingItems.length > 1 ? "high" : "medium",
    message: `Meeting ending with undiscussed agenda items: ${missingItems.join(", ")}.`,
    surfaceReason: `${missingItems.length} agenda item(s) not covered: ${missingItems.join(", ")}.`,
    suggestion:
      "Address remaining items now or schedule a follow-up before closing.",
    speakerId: "",
    confidence: 0.9,
  };

  return alert;
}
