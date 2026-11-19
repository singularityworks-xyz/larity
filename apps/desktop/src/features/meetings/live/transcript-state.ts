import type { LivePendingUtterance, LiveUtterance } from "./types";

export function pendingOverlapsSttRange(
  pending: LivePendingUtterance,
  utteranceStartOffset: number,
  utteranceDuration: number,
  slackSec = 0.5
): boolean {
  const utteranceStart = utteranceStartOffset - slackSec;
  const utteranceEnd = utteranceStartOffset + utteranceDuration + slackSec;
  const pendingStart = pending.startSec - slackSec;
  const pendingEnd = pending.startSec + pending.durationSec + slackSec;
  return pendingStart < utteranceEnd && pendingEnd > utteranceStart;
}

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
