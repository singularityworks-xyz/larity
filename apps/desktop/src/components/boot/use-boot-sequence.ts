import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "../../lib/auth-client";
import { CONTROL_URL } from "../../lib/env";
import { queryClient } from "../../lib/query";
import {
  clearStoredSessionToken,
  getStoredSessionToken,
} from "../../lib/session-token";

export type BootStep = 1 | 2 | 3 | 4;

export interface BootState {
  audioWarning: boolean;
  error: string | null;
  isBootComplete: boolean;
  isRetrying: boolean;
  progressPercent: number;
  retryAttempt: number;
  retrySecondsRemaining: number;
  statusDetail: string;
  step: BootStep;
  stepLabel: string;
}

const STEP_LABELS: Record<BootStep, string> = {
  1: "Initializing runtime...",
  2: "Loading audio engine...",
  3: "Connecting workspace...",
  4: "Preparing dashboard...",
};

const STEP_DETAILS: Record<BootStep, string> = {
  1: "Validating system bridges and local configuration",
  2: "Checking audio capture and hardware capabilities",
  3: "Verifying workspace session and service connection",
  4: "Pre-warming live dashboard queries",
};

function calculateBackoffDelay(attempt: number): number {
  const base = Math.min(30, 2 ** (attempt - 1));
  const jitter = Math.random() * 0.4;
  return Math.round(base + jitter);
}

async function checkAudioDeviceAvailability(): Promise<boolean> {
  try {
    const audioPromise = invoke<
      { name: string; deviceId: string; isLoopback: boolean }[]
    >("audio_capture_list_devices");
    const timeoutPromise = new Promise<null>((r) =>
      setTimeout(() => r(null), 1200)
    );
    const devices = await Promise.race([audioPromise, timeoutPromise]);
    return Array.isArray(devices) && devices.length > 0;
  } catch {
    return false;
  }
}

async function checkServerReachable(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(`${CONTROL_URL}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function prewarmDashboardQueries(): Promise<void> {
  try {
    const prewarmPromise = Promise.allSettled([
      queryClient.prefetchQuery({
        queryKey: ["health"],
        queryFn: async () => {
          const res = await fetch(`${CONTROL_URL}/health`);
          return res.json();
        },
      }),
    ]);
    const timeoutGuard = new Promise((r) => setTimeout(r, 2000));
    await Promise.race([prewarmPromise, timeoutGuard]);
  } catch {
    // Non-fatal pre-warming
  }
}

export function useBootSequence() {
  const [state, setState] = useState<BootState>({
    step: 1,
    stepLabel: STEP_LABELS[1],
    statusDetail: STEP_DETAILS[1],
    progressPercent: 15,
    isBootComplete: false,
    isRetrying: false,
    retryAttempt: 0,
    retrySecondsRemaining: 0,
    audioWarning: false,
    error: null,
  });

  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const isExecutingRef = useRef(false);

  const clearAllTimers = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const handleNetworkFailure = useCallback(
    (nextAttempt: number, onRetry: () => void) => {
      const delaySeconds = calculateBackoffDelay(nextAttempt);
      let remaining = delaySeconds;

      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0 && countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        setState((s) => ({
          ...s,
          retrySecondsRemaining: Math.max(0, remaining),
        }));
      }, 1000);

      retryTimerRef.current = setTimeout(() => {
        onRetry();
      }, delaySeconds * 1000);

      setState((prev) => ({
        ...prev,
        step: 3,
        isRetrying: true,
        retryAttempt: nextAttempt,
        retrySecondsRemaining: delaySeconds,
        error: `Unable to reach ${CONTROL_URL}. Reconnecting automatically...`,
      }));
    },
    []
  );

  const runBootSequence = useCallback(async () => {
    if (isExecutingRef.current) {
      return;
    }
    isExecutingRef.current = true;
    clearAllTimers();

    try {
      // Step 1: Runtime & Native Window Reveal
      setState((prev) => ({
        ...prev,
        step: 1,
        stepLabel: STEP_LABELS[1],
        statusDetail: STEP_DETAILS[1],
        progressPercent: 25,
        isRetrying: false,
        error: null,
      }));

      try {
        await getCurrentWindow().show();
      } catch {
        // Non-Tauri fallback
      }

      // Step 2: Audio Engine Check
      setState((prev) => ({
        ...prev,
        step: 2,
        stepLabel: STEP_LABELS[2],
        statusDetail: STEP_DETAILS[2],
        progressPercent: 50,
      }));

      const audioAvailable = await checkAudioDeviceAvailability();
      if (!audioAvailable) {
        setState((prev) => ({ ...prev, audioWarning: true }));
      }

      // Step 3: Workspace & Connectivity Validation
      setState((prev) => ({
        ...prev,
        step: 3,
        stepLabel: STEP_LABELS[3],
        statusDetail: STEP_DETAILS[3],
        progressPercent: 75,
      }));

      const token = getStoredSessionToken();
      if (token) {
        const isOnline = await checkServerReachable();
        if (!isOnline) {
          isExecutingRef.current = false;
          handleNetworkFailure(state.retryAttempt + 1, () => {
            runBootSequence();
          });
          return;
        }

        try {
          const session = await authClient.getSession();
          if (!session.data?.user) {
            clearStoredSessionToken();
            setState((prev) => ({
              ...prev,
              step: 4,
              progressPercent: 100,
              isBootComplete: true,
              isRetrying: false,
            }));
            isExecutingRef.current = false;
            return;
          }
        } catch {
          // Proceed
        }
      }

      // Step 4: Preparing Dashboard
      setState((prev) => ({
        ...prev,
        step: 4,
        stepLabel: STEP_LABELS[4],
        statusDetail: STEP_DETAILS[4],
        progressPercent: 90,
      }));

      await prewarmDashboardQueries();
      await new Promise((r) => setTimeout(r, 1000));

      setState((prev) => ({
        ...prev,
        progressPercent: 100,
        isBootComplete: true,
        isRetrying: false,
        error: null,
      }));
    } catch (fatalErr) {
      setState((prev) => ({
        ...prev,
        error:
          fatalErr instanceof Error
            ? fatalErr.message
            : "Unexpected bootstrap failure",
        isBootComplete: true,
      }));
    } finally {
      isExecutingRef.current = false;
    }
  }, [clearAllTimers, handleNetworkFailure, state.retryAttempt]);

  const triggerRetryNow = useCallback(() => {
    clearAllTimers();
    runBootSequence();
  }, [clearAllTimers, runBootSequence]);

  const continueOffline = useCallback(() => {
    clearAllTimers();
    setState((prev) => ({
      ...prev,
      step: 4,
      progressPercent: 100,
      isBootComplete: true,
      isRetrying: false,
      error: null,
    }));
  }, [clearAllTimers]);

  const signOutAndReset = useCallback(async () => {
    clearAllTimers();
    clearStoredSessionToken();
    try {
      await authClient.signOut();
    } catch {
      // Ignore network errors
    }
    setState((prev) => ({
      ...prev,
      step: 4,
      progressPercent: 100,
      isBootComplete: true,
      isRetrying: false,
      error: null,
    }));
  }, [clearAllTimers]);

  useEffect(() => {
    runBootSequence();
    return () => {
      clearAllTimers();
    };
  }, [runBootSequence, clearAllTimers]);

  return {
    ...state,
    triggerRetryNow,
    continueOffline,
    signOutAndReset,
  };
}
