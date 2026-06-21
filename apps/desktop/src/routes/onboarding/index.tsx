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
import { TitleBar } from "../../components/title-bar";
import { useAuthSession } from "../../features/auth/use-session";
import {
  buttonClass,
  calendarComingSoonClass,
  calendarPlaceholderClass,
  cx,
  formErrorClass,
  permissionDescriptionClass,
  permissionInfoClass,
  permissionLabelClass,
  permissionStateClass,
  permissionStatusClass,
  progressDotClass as progressDotBaseClass,
  progressDotsClass,
  statusDotClass,
  wizardBodyClass,
  wizardCardClass,
  wizardFooterClass,
  wizardHeaderClass,
  wizardPageClass,
  wizardStepLabelClass,
  wizardTitleClass,
} from "../../lib/ui";

type PermissionKey = "microphone" | "systemAudio" | "notifications";

interface PermissionState {
  requested: boolean;
  status: "idle" | "requested" | "granted" | "denied" | "unavailable";
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
        <span className="text-success-fg">Granted</span>
      </>
    );
  }

  if (state.status === "denied") {
    return (
      <>
        <X size={12} />
        <span className="text-danger-fg">Denied</span>
      </>
    );
  }

  if (state.status === "unavailable") {
    return (
      <>
        <AlertTriangle size={12} />
        <span className="text-fg-subtle">Unavailable</span>
      </>
    );
  }

  return (
    <button
      className={buttonClass({ size: "sm", variant: "secondary" })}
      onClick={onRequest}
      type="button"
    >
      {state.requested ? "Retry" : "Request"}
    </button>
  );
}

function permissionStatusDot(state: PermissionState) {
  if (state.status === "granted") {
    return <div className={cx(statusDotClass, "bg-success-fg")} />;
  }
  if (state.status === "denied") {
    return <div className={cx(statusDotClass, "bg-danger-fg")} />;
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
    <div className={permissionStatusClass}>
      <div className="flex items-center gap-2.5">
        <div className="shrink-0 text-fg-subtle">{icon}</div>
        <div className={permissionInfoClass}>
          <span className={permissionLabelClass}>{label}</span>
          <span className={permissionDescriptionClass}>{description}</span>
        </div>
      </div>
      <div className={permissionStateClass}>
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
      <div className={wizardBodyClass}>
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

      <div className={wizardFooterClass}>
        <button
          className={buttonClass({ size: "lg" })}
          disabled={!canProceed}
          onClick={onComplete}
          type="button"
        >
          Continue
          <ArrowRight size={14} />
        </button>
      </div>

      {allRequested && !canProceed ? (
        <p className={cx(formErrorClass, "mt-3 text-center")}>
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
      <div className={wizardBodyClass}>
        <div className={cx(permissionStatusClass, "mb-2")}>
          <div className="flex items-center gap-2.5">
            <div className="shrink-0 text-fg-subtle">
              <Calendar size={14} />
            </div>
            <div className={permissionInfoClass}>
              <span className={permissionLabelClass}>Calendar connect</span>
              <span className={permissionDescriptionClass}>
                Sync your meetings to get briefs and alerts
              </span>
            </div>
          </div>
          <span className={calendarComingSoonClass}>Coming soon</span>
        </div>

        <div className={calendarPlaceholderClass}>
          <Calendar size={20} />
          <p>
            Google and Microsoft calendar integration will be available in a
            future update. You can still start and join meetings manually.
          </p>
        </div>
      </div>

      <div className={wizardFooterClass}>
        <button
          className={buttonClass({ size: "lg" })}
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

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
    },
    []
  );

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
          className={buttonClass({ size: "lg" })}
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
          <span className="font-medium font-mono text-[13px] text-fg-muted tabular-nums">
            {countdown}s
          </span>
          <button
            className={buttonClass({ variant: "secondary" })}
            onClick={stopRecording}
            type="button"
          >
            <MicOff size={14} />
            Stop
          </button>
        </>
      );
    }

    return (
      <span className="font-medium font-mono text-[13px] text-fg-muted tabular-nums">
        Calibrated
      </span>
    );
  }

  return (
    <>
      <div className={wizardBodyClass}>
        <div className="grid gap-4 text-center">
          <div className="flex h-10 items-end justify-center gap-0.5 py-1">
            {Array.from({ length: VOICE_BAR_COUNT }, (_, i) => {
              const height =
                state === "recording"
                  ? Math.max(3, level * 40 * (0.4 + 0.6 * Math.random()))
                  : 3;
              return (
                <div
                  className={cx(
                    "w-[3px] rounded-none bg-border transition-[height,background-color] duration-[80ms] ease-[cubic-bezier(0.2,0,0,1)]",
                    state === "recording" && "bg-accent"
                  )}
                  key={`voice-bar-${i.toString()}`}
                  style={{ height: `${height}px` }}
                />
              );
            })}
          </div>

          {voiceControls()}

          <p className="m-0 font-medium text-fg-muted text-xs leading-normal">
            Speak naturally for 10 seconds. This calibrates your microphone for
            local voice detection.
          </p>

          <p className="m-0 inline-flex items-center gap-1 font-medium text-[11px] text-fg-subtle leading-[1.45] [&_svg]:h-3 [&_svg]:w-3">
            <Shield size={12} />
            We do not store voice samples. Audio never leaves your device during
            calibration.
          </p>
        </div>
      </div>

      <div className={wizardFooterClass}>
        {state === "done" ? (
          <button
            className={buttonClass({ size: "lg" })}
            onClick={handleComplete}
            type="button"
          >
            Go to dashboard
            <ArrowRight size={14} />
          </button>
        ) : (
          <button
            className={buttonClass({ size: "lg", variant: "secondary" })}
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
    return cx(progressDotBaseClass, "w-4 bg-accent");
  }
  if (i < step) {
    return cx(progressDotBaseClass, "bg-accent");
  }
  return progressDotBaseClass;
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
    <>
      <TitleBar />
      <div className={cx(wizardPageClass, "pt-9")}>
        <div className={wizardCardClass}>
          <div className={wizardHeaderClass}>
            <h1 className={wizardTitleClass}>Set up Larity</h1>
            <p className={wizardStepLabelClass}>{STEPS[step]}</p>
            <div className={progressDotsClass}>
              {STEPS.map((label, i) => (
                <div className={progressDotClass(i, step)} key={label} />
              ))}
            </div>
          </div>

          {renderStepContent(step, setStep, () => navigate("/dashboard"))}
        </div>
      </div>
    </>
  );
}
