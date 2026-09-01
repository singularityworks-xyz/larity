import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { ProcessingStatus } from "./types";

/**
 * Polls the processing status for a given meeting until pipeline steps are settled.
 *
 * @param meetingId - The meeting ID to poll status for.
 */
export function useProcessingStatus(meetingId: string) {
  return useQuery({
    queryKey: ["processing-status", meetingId],
    queryFn: () =>
      api.get<ProcessingStatus>(`/meetings/${meetingId}/processing-status`),
    refetchInterval: (query) =>
      isProcessingSettled(query.state.data) ? false : 3000,
    enabled: Boolean(meetingId),
  });
}

/**
 * Returns true if both pipeline steps have completed (done or failed).
 */
export function isProcessingSettled(
  status: ProcessingStatus | undefined
): boolean {
  if (!status) {
    return false;
  }
  const { transcribe, summary } = status.steps;
  const settled = (s: string | null) =>
    s === "done" || s === "failed" || s === null;
  return settled(transcribe) && settled(summary);
}

/**
 * Returns true if both pipeline steps are successfully done.
 */
export function isProcessingComplete(
  status: ProcessingStatus | undefined
): boolean {
  if (!status) {
    return false;
  }
  return status.steps.transcribe === "done" && status.steps.summary === "done";
}

/**
 * Returns true if any step is currently in progress.
 */
export function isProcessingInProgress(
  status: ProcessingStatus | undefined
): boolean {
  if (!status) {
    return false;
  }
  const { transcribe, summary } = status.steps;
  return (
    transcribe === "processing" ||
    transcribe === "queued" ||
    summary === "processing" ||
    summary === "queued"
  );
}
