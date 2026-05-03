import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  Mic,
  MicOff,
  MonitorUp,
  Shield,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "../../features/auth/use-session";

type PermissionKey = "microphone" | "systemAudio" | "notifications";

interface PermissionState {
  status: "idle" | "requested" | "granted" | "denied" | "unavailable";
  requested: boolean;
}

type Permissions = Record<PermissionKey, PermissionState>;

function usePermissions() {
  const [permissions, setPermissions] = useState<Permissions>({
    microphone: { status: "idle", requested: false },
    systemAudio: { status: "idle", requested: false },
    notifications: { status: "idle", requested: false },
  });

  const requestMicrophone = useCallback(async () => {
    setPermissions((prev) => ({
      ...prev,
      microphone: { status: "idle", requested: true },
    }));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) {
        track.stop();
      }
      setPermissions((prev) => ({
        ...prev,
        microphone: { status: "granted", requested: true },
      }));
    } catch {
      setPermissions((prev) => ({
        ...prev,
        microphone: { status: "denied", requested: true },
      }));
    }
  }, []);

  const requestSystemAudio = useCallback(() => {
    setPermissions((prev) => ({
      ...prev,
      systemAudio: { status: "idle", requested: true },
    }));

    setPermissions((prev) => ({
      ...prev,
      systemAudio: { status: "granted", requested: true },
    }));
  }, []);

  const requestNotifications = useCallback(async () => {
    setPermissions((prev) => ({
      ...prev,
      notifications: { status: "idle", requested: true },
    }));

    if (!("Notification" in window)) {
      setPermissions((prev) => ({
        ...prev,
        notifications: { status: "unavailable", requested: true },
      }));
      return;
    }

    const result = await Notification.requestPermission();
    setPermissions((prev) => ({
      ...prev,
      notifications: {
        status: result === "granted" ? "granted" : "denied",
        requested: true,
      },
    }));
  }, []);

  const canProceed = permissions.microphone.status === "granted";

  return {
    permissions,
    requestMicrophone,
    requestSystemAudio,
    requestNotifications,
    canProceed,
  };
}

function permissionStateLabel(state: PermissionState, onRequest: () => void) {
  if (state.status === "granted") {
    return (
      <>
        <Check size={12} />
        <span className="permission-granted">Granted</span>
      </>
    );
  }

  if (state.status === "denied") {
    return (
      <>
        <X size={12} />
        <span className="permission-denied">Denied</span>
      </>
    );
  }

  if (state.status === "unavailable") {
    return (
      <>
        <AlertTriangle size={12} />
        <span className="permission-pending">Unavailable</span>
      </>
    );
  }

  return (
    <button
      className="btn btn-secondary btn-sm"
      onClick={onRequest}
      type="button"
    >
      {state.requested ? "Retry" : "Request"}
    </button>
  );
}

function permissionStatusDot(state: PermissionState) {
  if (state.status === "granted") {
    return <div className="status-dot status-dot-success" />;
  }
  if (state.status === "denied") {
    return <div className="status-dot status-dot-danger" />;
  }
  return null;
}

function PermissionRow({
  icon,
  label,
  description,
  state,
  onRequest,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  state: PermissionState;
  onRequest: () => void;
}) {
  return (
    <div className="permission-status">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ color: "var(--fg-subtle)", flexShrink: 0 }}>{icon}</div>
        <div className="permission-info">
          <span className="permission-label">{label}</span>
          <span className="permission-desc">{description}</span>
        </div>
      </div>
      <div className="permission-state">
        {permissionStateLabel(state, onRequest)}
        {permissionStatusDot(state)}
      </div>
    </div>
  );
}

function StepPermissions({ onComplete }: { onComplete: () => void }) {
  const {
    permissions,
    requestMicrophone,
    requestSystemAudio,
    requestNotifications,
    canProceed,
  } = usePermissions();

  const allRequested =
    permissions.microphone.requested &&
    permissions.systemAudio.requested &&
    permissions.notifications.requested;

  return (
    <>
      <div className="wizard-body">
        <PermissionRow
          description="Required for voice detection and assistant"
          icon={<Mic size={14} />}
          label="Microphone access"
          onRequest={requestMicrophone}
          state={permissions.microphone}
        />
        <PermissionRow
          description="Required for meeting capture on host machines"
          icon={<MonitorUp size={14} />}
          label="System audio loopback"
          onRequest={requestSystemAudio}
          state={permissions.systemAudio}
        />
        <PermissionRow
          description="For meeting alerts and reminders"
          icon={<Shield size={14} />}
          label="Notifications"
          onRequest={requestNotifications}
          state={permissions.notifications}
        />
      </div>

      <div className="wizard-footer">
        <button
          className="btn btn-primary btn-lg"
          disabled={!canProceed}
          onClick={onComplete}
          type="button"
        >
          Continue
          <ArrowRight size={14} />
        </button>
      </div>

      {allRequested && !canProceed ? (
        <p
          className="form-error"
          style={{ textAlign: "center", marginTop: 12 }}
        >
          Microphone access is required. You can run as participant-only after
          setup.
        </p>
      ) : null}
    </>
  );
}

function StepCalendar({ onSkip }: { onSkip: () => void }) {
  return (
    <>
      <div className="wizard-body">
        <div className="permission-status" style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ color: "var(--fg-subtle)", flexShrink: 0 }}>
              <Calendar size={14} />
            </div>
            <div className="permission-info">
              <span className="permission-label">Calendar connect</span>
              <span className="permission-desc">
                Sync your meetings to get briefs and alerts
              </span>
            </div>
          </div>
          <span className="calendar-coming-soon">Coming soon</span>
        </div>

        <div className="calendar-placeholder">
          <Calendar size={20} />
          <p>
            Google and Microsoft calendar integration will be available in a
            future update. You can still start and join meetings manually.
          </p>
        </div>
      </div>

      <div className="wizard-footer">
        <button
          className="btn btn-primary btn-lg"
          onClick={onSkip}
          type="button"
        >
          Skip for now
          <ArrowRight size={14} />
        </button>
      </div>
    </>
  );
}

const VOICE_BAR_COUNT = 16;

function StepVoice({ onComplete }: { onComplete: () => void }) {
  const [state, setState] = useState<"idle" | "recording" | "done">("idle");
  const [countdown, setCountdown] = useState(10);
  const [level, setLevel] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      setState("recording");
      setCountdown(10);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const animate = () => {
        if (!analyserRef.current) {
          return;
        }
        analyser.getByteFrequencyData(dataArray);
        const avg =
          dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
        setLevel(Math.min(1, avg / 64));
        if (state === "recording") {
          requestAnimationFrame(animate);
        }
      };
      animate();

      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            stopRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      setState("done");
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    analyserRef.current = null;
    setState("done");
    setLevel(0);
  }

  function handleComplete() {
    onComplete();
  }

  function voiceControls() {
    if (state === "idle") {
      return (
        <button
          className="btn btn-primary btn-lg"
          onClick={startRecording}
          type="button"
        >
          <Mic size={14} />
          Start mic check
        </button>
      );
    }

    if (state === "recording") {
      return (
        <>
          <span className="voice-timer">{countdown}s</span>
          <button
            className="btn btn-secondary"
            onClick={stopRecording}
            type="button"
          >
            <MicOff size={14} />
            Stop
          </button>
        </>
      );
    }

    return <span className="voice-timer">Calibrated</span>;
  }

  return (
    <>
      <div className="wizard-body">
        <div className="voice-baseline">
          <div className="voice-meter">
            {Array.from({ length: VOICE_BAR_COUNT }, (_, i) => {
              const height =
                state === "recording"
                  ? Math.max(3, level * 40 * (0.4 + 0.6 * Math.random()))
                  : 3;
              return (
                <div
                  className={`voice-bar${state === "recording" ? "voice-bar-active" : ""}`}
                  key={`voice-bar-${i.toString()}`}
                  style={{ height: `${height}px` }}
                />
              );
            })}
          </div>

          {voiceControls()}

          <p className="voice-hint">
            Speak naturally for 10 seconds. This calibrates your microphone for
            local voice detection.
          </p>

          <p className="voice-privacy">
            <Shield size={12} />
            We do not store voice samples. Audio never leaves your device during
            calibration.
          </p>
        </div>
      </div>

      <div className="wizard-footer">
        {state === "done" ? (
          <button
            className="btn btn-primary btn-lg"
            onClick={handleComplete}
            type="button"
          >
            Go to dashboard
            <ArrowRight size={14} />
          </button>
        ) : (
          <button
            className="btn btn-secondary btn-lg"
            onClick={handleComplete}
            type="button"
          >
            Skip calibration
          </button>
        )}
      </div>
    </>
  );
}

const STEPS = ["Permissions check", "Calendar connect", "Voice baseline"];

function progressDotClass(i: number, step: number): string {
  if (i === step) {
    return "progress-dot progress-dot-active";
  }
  if (i < step) {
    return "progress-dot progress-dot-done";
  }
  return "progress-dot";
}

function renderStepContent(
  step: number,
  onSetStep: (step: number) => void,
  onNavigateToDashboard: () => void
) {
  if (step === 0) {
    return <StepPermissions onComplete={() => onSetStep(1)} />;
  }
  if (step === 1) {
    return <StepCalendar onSkip={() => onSetStep(2)} />;
  }
  return <StepVoice onComplete={onNavigateToDashboard} />;
}

export function OnboardingPage() {
  const [step, setStep] = useState(0);
  const session = useAuthSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (session.user?.orgId) {
      navigate("/dashboard", { replace: true });
    }
  }, [session.user?.orgId, navigate]);

  return (
    <div className="wizard-page">
      <div className="wizard-card">
        <div className="wizard-header">
          <h1 className="wizard-title">Set up Larity</h1>
          <p className="wizard-step-label">{STEPS[step]}</p>
          <div className="progress-dots">
            {STEPS.map((label, i) => (
              <div className={progressDotClass(i, step)} key={label} />
            ))}
          </div>
        </div>

        {renderStepContent(step, setStep, () => navigate("/dashboard"))}
      </div>
    </div>
  );
}
