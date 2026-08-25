import { useEffect, useMemo, useState } from "react";
import type { DotMatrixPhase } from "./dotmatrix-core";

export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");

    const update = () => {
      setPrefersReducedMotion(query.matches);
    };

    update();
    query.addEventListener("change", update);

    return () => {
      query.removeEventListener("change", update);
    };
  }, []);

  return prefersReducedMotion;
}

export interface UseCyclePhaseOptions {
  active: boolean;
  cycleMsBase: number;
  speed?: number;
}

export function useCyclePhase({
  active,
  cycleMsBase,
  speed = 1,
}: UseCyclePhaseOptions): number {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!active) {
      setPhase(0);
      return;
    }

    const safeSpeed = speed > 0 ? speed : 1;
    const raw = cycleMsBase / safeSpeed;
    const cycleMs = raw > 0 && Number.isFinite(raw) ? raw : 1000;
    const start = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const elapsed = (((now - start) % cycleMs) + cycleMs) % cycleMs;
      setPhase(elapsed / cycleMs);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, cycleMsBase, speed]);

  return phase;
}

interface UseDotMatrixPhasesOptions {
  animated?: boolean;
  hoverAnimated?: boolean;
  speed?: number;
}

interface DotMatrixPhasesResult {
  phase: DotMatrixPhase;
}

export function useDotMatrixPhases({
  animated = false,
}: UseDotMatrixPhasesOptions): DotMatrixPhasesResult {
  const phase: DotMatrixPhase = animated ? "loadingRipple" : "idle";

  return useMemo(
    () => ({
      phase,
    }),
    [phase]
  );
}

export interface UseSteppedCycleOptions {
  active: boolean;
  cycleMsBase: number;
  idleStep?: number;
  speed?: number;
  steps: number;
}

export function useSteppedCycle({
  active,
  cycleMsBase,
  steps,
  speed = 1,
  idleStep = 0,
}: UseSteppedCycleOptions): number {
  const [step, setStep] = useState(idleStep);

  useEffect(() => {
    if (!active) {
      setStep(idleStep);
      return;
    }

    const safeSteps = Math.max(1, Math.floor(steps));
    const safeSpeed = speed > 0 ? speed : 1;
    const rawCycleMs = cycleMsBase / safeSpeed;
    const rawStepMs = rawCycleMs / safeSteps;
    const stepMs = rawStepMs > 0 && Number.isFinite(rawStepMs) ? rawStepMs : 1;
    const cycleMs = stepMs * safeSteps;
    const start = performance.now();
    let currentStep = idleStep;
    let rafId = 0;

    const tick = (now: number) => {
      const elapsed = (((now - start) % cycleMs) + cycleMs) % cycleMs;
      const nextStep = Math.floor(elapsed / stepMs) % safeSteps;
      if (nextStep !== currentStep) {
        currentStep = nextStep;
        setStep(nextStep);
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, cycleMsBase, steps, speed, idleStep]);

  return active ? step : idleStep;
}
