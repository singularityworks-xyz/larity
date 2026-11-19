import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import type { ProcessingStatus } from "./types";

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

export function isProcessingComplete(
  status: ProcessingStatus | undefined
): boolean {
  if (!status) {
    return false;
  }
  return status.steps.transcribe === "done" && status.steps.summary === "done";
}

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
