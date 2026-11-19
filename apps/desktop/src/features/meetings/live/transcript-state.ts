import type { LiveUtterance } from "./types";

export function upsertLiveUtterance(
  utterances: LiveUtterance[],
  incoming: LiveUtterance
): LiveUtterance[] {
  const index = utterances.findIndex(({ id }) => id === incoming.id);
  const previous = utterances[index];
  if (!previous) {
    return [...utterances, incoming];
  }

  const next = [...utterances];
  next[index] = {
    ...previous,
    ...incoming,
    isCommitment: previous.isCommitment,
    hasAlert: previous.hasAlert,
    hasMemory: previous.hasMemory,
    topicId: incoming.topicId ?? previous.topicId,
  };
  return next;
}
