import { AlertTriangle, RefreshCcw } from "lucide-react";
import type { ProcessingStatus } from "./types";
import {
  isProcessingComplete,
  isProcessingInProgress,
  isProcessingSettled,
} from "./use-processing-status";
import type { useReprocess } from "./use-reprocess";

function InProgressBanner({
  status,
}: {
  status: ProcessingStatus | undefined;
}) {
  return (
    <div
      aria-live="polite"
      className="fade-in relative animate-in overflow-hidden rounded-xl border border-info/20 bg-info/10 p-4 backdrop-blur-sm duration-200"
    >
      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-info/0 via-info/5 to-info/0" />
      <div className="relative z-10 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info/20 text-info">
          <RefreshCcw className="h-5 w-5 animate-spin" />
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-info text-sm">
            {status?.steps.transcribe === "processing" ||
            status?.steps.transcribe === "queued"
              ? "Transcribing meeting audio…"
              : "Extracting insights from transcript…"}
          </span>
          <span className="font-mono text-info/70 text-xs">
            {status?.steps.transcribe === "done"
              ? "transcribe ✓"
              : (status?.steps.transcribe ?? "transcribe…")}{" "}
            ·{" "}
            {status?.steps.summary === "done"
              ? "summary ✓"
              : (status?.steps.summary ?? "summary…")}
          </span>
        </div>
      </div>
    </div>
  );
}

function FailedBanner({
  status,
  reprocess,
  onReprocessSuccess,
}: {
  status: ProcessingStatus | undefined;
  reprocess: ReturnType<typeof useReprocess>;
  onReprocessSuccess: () => void;
}) {
  const isNoTranscript = status?.errorReason === "NO_TRANSCRIPT";
  return (
    <div
      aria-live="assertive"
      className="fade-in relative animate-in overflow-hidden rounded-xl border border-danger/30 bg-danger/10 p-4 backdrop-blur-sm duration-200"
    >
      <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/20 text-danger">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <span className="font-semibold text-danger text-sm">
            {isNoTranscript
              ? "Processing failed: No transcript available."
              : `Processing failed. ${status?.steps.transcribe === "failed" ? "Transcription step failed." : "Insight extraction failed."}`}
          </span>
          {isNoTranscript && (
            <p className="mt-1 text-danger/80 text-xs">
              This usually happens when the meeting didn't have any
              transcriptions (e.g. the meeting was just accidental).
            </p>
          )}
        </div>
        <button
          className="shrink-0 rounded-lg bg-danger px-4 py-2 font-semibold text-white text-xs transition-colors hover:bg-danger/90 active:scale-95 disabled:opacity-50"
          disabled={reprocess.isPending || isNoTranscript}
          onClick={() =>
            reprocess.mutate(undefined, { onSuccess: onReprocessSuccess })
          }
          type="button"
        >
          {reprocess.isPending ? "Re-queuing…" : "Try Again"}
        </button>
      </div>
      {reprocess.error && (
        <div className="mt-2 font-medium text-danger text-xs">
          Error: {reprocess.error.message}
        </div>
      )}
    </div>
  );
}

export function ProcessingBanner({
  status,
  reprocess,
  onReprocessSuccess,
}: {
  status: ProcessingStatus | undefined;
  reprocess: ReturnType<typeof useReprocess>;
  onReprocessSuccess: () => void;
}) {
  const inProgress = isProcessingInProgress(status);
  const settled = isProcessingSettled(status);
  const complete = isProcessingComplete(status);
  const failed =
    settled &&
    !complete &&
    (status?.steps.transcribe === "failed" ||
      status?.steps.summary === "failed");

  if (!(inProgress || settled)) {
    return null;
  }
  if (inProgress) {
    return <InProgressBanner status={status} />;
  }
  if (failed) {
    return (
      <FailedBanner
        onReprocessSuccess={onReprocessSuccess}
        reprocess={reprocess}
        status={status}
      />
    );
  }
  return null;
}
