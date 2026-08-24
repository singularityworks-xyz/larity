import { useEffect, useRef } from "react";

interface VoiceGradientProps {
  alertSeverity: "critical" | "high" | "medium" | "low" | null;
  alertsMuted?: boolean;
  amplitude?: number;
  hasActiveAlert: boolean;
  isSpeaking: boolean;
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
      const {
        isSpeaking: pIsSpeaking,
        hasActiveAlert: pHasActiveAlert,
        alertSeverity: pAlertSeverity,
        amplitude: pAmplitude = 0,
      } = propsRef.current;

      const isIdle = !pIsSpeaking && !pHasActiveAlert && state.amp < 0.02;
      const targetInterval = isIdle ? 33 : 16; // 30fps when idle, 60fps when active
      const dt = time - lastTime;

      if (dt < targetInterval) {
        rafId = requestAnimationFrame(drawFrame);
        return;
      }
      lastTime = time;

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
      // Refinement 2: 'lighten' blending mode creates a rich glow without washing out colors to pure white
      ctx.globalCompositeOperation = "lighten";

      // Draw a blob: full-canvas fillRect so overlapping blobs blend correctly
      const drawBlob = (
        x: number,
        y: number,
        rx: number,
        ry: number,
        h: number,
        s: number,
        l: number,
        a: number
      ) => {
        ctx.save();
        ctx.translate(x, y);
        // Refinement 3: Asymmetric elliptical stretching (makes them look like light waves/auroras)
        const scaleY = Math.max(0.01, ry / Math.max(0.01, rx));
        ctx.scale(1, scaleY);

        const r = Math.max(0.1, rx);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);

        // Refinement 4: Non-linear, softer color stops for volumetric light falloff
        g.addColorStop(0, `hsla(${h}, ${s}%, ${l}%, ${a})`);
        g.addColorStop(0.3, `hsla(${h}, ${s}%, ${l * 0.8}%, ${a * 0.5})`);
        g.addColorStop(0.65, `hsla(${h}, ${s}%, ${l * 0.6}%, ${a * 0.15})`);
        g.addColorStop(1, "transparent");

        ctx.fillStyle = g;
        // Pad slightly to ensure the ellipse bounds are fully filled
        const pad = r * 1.1;
        ctx.fillRect(-pad, -pad / scaleY, pad * 2, (pad * 2) / scaleY);
        ctx.restore();
      };

      const baseY = H + W * 0.12;

      // Refinement 5: Irrational orbit ratios (using 1.618, Math.E, Math.PI) for infinite non-repeating motion

      // Blob 1: centre — biggest, picks up most amplitude
      const cx1 =
        W * 0.5 +
        Math.sin(t * 1.618) * W * 0.06 +
        Math.cos(t * 0.7) * W * 0.02 * amp;
      const cy1 = baseY - amp * H * 0.38 + Math.cos(t * 0.9) * H * 0.04;
      const r1x = W * (0.65 + amp * 0.55);
      const r1y = W * (0.35 + amp * 0.35);
      // Refinement 1: Iridescent duotone shift (hue + 10)
      drawBlob(
        cx1,
        cy1,
        r1x,
        r1y,
        state.hue + 10,
        70,
        42 + amp * 18,
        0.38 + amp * 0.4
      );

      // Blob 2: left accent — cooler hue offset
      const cx2 = W * 0.22 + Math.sin(t * Math.E + 2) * W * 0.09 * (1 + amp);
      const cy2 = baseY - amp * H * 0.28 + Math.cos(t * 1.618 + 1) * H * 0.05;
      const r2x = W * (0.52 + amp * 0.4);
      const r2y = W * (0.28 + amp * 0.3);
      drawBlob(
        cx2,
        cy2,
        r2x,
        r2y,
        state.hue - 25,
        68,
        38 + amp * 12,
        0.28 + amp * 0.32
      );

      // Blob 3: right accent — warmer hue offset
      const cx3 = W * 0.78 + Math.sin(t * Math.PI + 4) * W * 0.09 * (1 + amp);
      const cy3 = baseY - amp * H * 0.28 + Math.cos(t * Math.E + 3) * H * 0.05;
      const r3x = W * (0.52 + amp * 0.4);
      const r3y = W * (0.28 + amp * 0.3);
      drawBlob(
        cx3,
        cy3,
        r3x,
        r3y,
        state.hue + 35,
        68,
        38 + amp * 12,
        0.28 + amp * 0.32
      );

      // Blob 4: tight bright core — only noticeable when amp is up
      const cx4 = cx1 + Math.sin(t * 4.669) * W * 0.03;
      const cy4 = cy1 + Math.cos(t * Math.PI) * H * 0.03;
      const r4x = W * (0.35 + amp * 0.45);
      const r4y = W * (0.15 + amp * 0.25);
      drawBlob(
        cx4,
        cy4,
        r4x,
        r4y,
        state.hue,
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
      className="voice-gradient-canvas pointer-events-none transform-gpu will-change-transform"
      style={{
        filter: alertsMuted ? "saturate(0) brightness(0.6)" : "none",
        transition: "filter 600ms ease-out",
      }}
    >
      <canvas className="h-full w-full" ref={canvasRef} />
    </div>
  );
}
