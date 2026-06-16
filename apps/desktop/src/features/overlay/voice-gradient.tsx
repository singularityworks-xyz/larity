import { useEffect, useRef } from "react";

interface VoiceGradientProps {
  amplitude?: number;
  isSpeaking: boolean;
  hasActiveAlert: boolean;
  alertSeverity: "critical" | "high" | "medium" | "low" | null;
  alertsMuted?: boolean;
}

export function VoiceGradient({
  isSpeaking,
  hasActiveAlert,
  alertSeverity,
  alertsMuted = false,
  amplitude = 0,
}: VoiceGradientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const propsRef = useRef({
    isSpeaking,
    hasActiveAlert,
    alertSeverity,
    amplitude,
  });

  useEffect(() => {
    propsRef.current = { isSpeaking, hasActiveAlert, alertSeverity, amplitude };
  }, [isSpeaking, hasActiveAlert, alertSeverity, amplitude]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      return;
    }

    let rafId: number;
    let lastTime = performance.now();

    const state = {
      t: 0,
      amp: 0,
      hue: 252,
    };

    // Contextual hue based on current props state
    const getTargetHue = (
      hasAlert: boolean,
      alertSev: typeof alertSeverity,
      speaking: boolean
    ) => {
      if (hasAlert) {
        if (alertSev === "critical") {
          return 5;
        }
        if (alertSev === "high") {
          return 28;
        }
      }
      if (speaking) {
        return 200;
      }
      return 252;
    };

    // Simulate living rhythm when mic is active
    const getDynamicAmp = (time: number, speaking: boolean) => {
      if (!speaking) {
        return 0;
      }
      const flutter = Math.sin(time * 0.014) * Math.cos(time * 0.008) * 0.12;
      const breath = Math.sin(time * 0.003) * 0.08;
      const tick = Math.sin(time * 0.025) * 0.04;
      return Math.max(0, Math.min(1, 0.35 + flutter + breath + tick));
    };

    const drawFrame = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;

      const {
        isSpeaking: pIsSpeaking,
        hasActiveAlert: pHasActiveAlert,
        alertSeverity: pAlertSeverity,
        amplitude: pAmplitude = 0,
      } = propsRef.current;

      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;

      const targetHue = getTargetHue(
        pHasActiveAlert,
        pAlertSeverity,
        pIsSpeaking
      );

      const simulatedAmp = getDynamicAmp(time, pIsSpeaking);
      const targetAmp = pIsSpeaking
        ? Math.max(simulatedAmp, pAmplitude * 1.1)
        : 0;

      // Asymmetric smoothing: snap up on speech, ease down gracefully
      const attack = 0.15;
      const decay = 0.025;
      state.amp +=
        (targetAmp - state.amp) * (targetAmp > state.amp ? attack : decay);
      state.hue += (targetHue - state.hue) * 0.015;
      state.t += dt * 0.0006;

      const t = state.t;
      const amp = state.amp;

      document.documentElement.style.setProperty(
        "--grad-hue",
        Math.round(state.hue).toString()
      );

      // Clear
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "screen";

      // Draw a blob: full-canvas fillRect so overlapping blobs blend correctly via "screen"
      const drawBlob = (
        x: number,
        y: number,
        radius: number,
        h: number,
        s: number,
        l: number,
        a: number
      ) => {
        const r = Math.max(0.1, radius);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `hsla(${h}, ${s}%, ${l}%, ${a})`);
        g.addColorStop(0.55, `hsla(${h}, ${s}%, ${l * 0.75}%, ${a * 0.45})`);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      };

      const baseY = H + W * 0.12;

      // Blob 1: centre — biggest, picks up most amplitude
      const cx1 =
        W * 0.5 +
        Math.sin(t * 1.1) * W * 0.06 +
        Math.cos(t * 0.7) * W * 0.02 * amp;
      const cy1 = baseY - amp * H * 0.38 + Math.cos(t * 0.9) * H * 0.04;
      const r1 = W * (0.55 + amp * 0.55);
      drawBlob(cx1, cy1, r1, state.hue, 70, 42 + amp * 18, 0.38 + amp * 0.4);

      // Blob 2: left accent — cooler hue offset
      const cx2 = W * 0.22 + Math.sin(t * 1.3 + 2) * W * 0.09 * (1 + amp);
      const cy2 = baseY - amp * H * 0.28 + Math.cos(t * 1.0 + 1) * H * 0.05;
      const r2 = W * (0.42 + amp * 0.4);
      drawBlob(
        cx2,
        cy2,
        r2,
        state.hue - 28,
        68,
        38 + amp * 12,
        0.28 + amp * 0.32
      );

      // Blob 3: right accent — warmer hue offset
      const cx3 = W * 0.78 + Math.sin(t * 1.5 + 4) * W * 0.09 * (1 + amp);
      const cy3 = baseY - amp * H * 0.28 + Math.cos(t * 1.2 + 3) * H * 0.05;
      const r3 = W * (0.42 + amp * 0.4);
      drawBlob(
        cx3,
        cy3,
        r3,
        state.hue + 32,
        68,
        38 + amp * 12,
        0.28 + amp * 0.32
      );

      // Blob 4: tight bright core — only noticeable when amp is up
      const cx4 = cx1 + Math.sin(t * 2.2) * W * 0.03;
      const cy4 = cy1 + Math.cos(t * 2.4) * H * 0.03;
      const r4 = W * (0.25 + amp * 0.45);
      drawBlob(
        cx4,
        cy4,
        r4,
        state.hue + 15,
        82,
        58 + amp * 18,
        0.08 + amp * 0.48
      );

      rafId = requestAnimationFrame(drawFrame);
    };

    rafId = requestAnimationFrame(drawFrame);
    return () => {
      cancelAnimationFrame(rafId);
      document.documentElement.style.removeProperty("--grad-hue");
    };
  }, []);

  // Handle high-DPI scaling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const setSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    setSize();
    window.addEventListener("resize", setSize);
    return () => window.removeEventListener("resize", setSize);
  }, []);

  return (
    <div
      className="voice-gradient-canvas"
      style={{
        filter: alertsMuted ? "saturate(0) brightness(0.6)" : "none",
        transition: "filter 600ms ease-out",
      }}
    >
      <canvas className="h-full w-full" ref={canvasRef} />
    </div>
  );
}
