/**
 * Tauri window management helpers.
 *
 * All calls are guarded behind `__TAURI_INTERNALS__` so the app still renders
 * in a plain browser during development without crashing.
 */
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

export interface WindowProfile {
  width: number;
  height: number;
  /** Whether the window should show window-control buttons. */
  hasControls: boolean;
}

export const WINDOW_PROFILES = {
  /** Splash / intro — small portrait rectangle, no controls */
  intro: { width: 380, height: 520, hasControls: false },
  /** Auth pages — wider landscape rectangle, with controls */
  auth: { width: 860, height: 560, hasControls: true },
  /** Main app — full-size, with controls */
  app: { width: 1200, height: 750, hasControls: true },
} satisfies Record<string, WindowProfile>;

/**
 * Resize the Tauri window to the given profile and re-centre it.
 * Falls back gracefully when running outside Tauri (plain browser).
 */
export async function applyWindowProfile(
  profile: WindowProfile
): Promise<void> {
  try {
    const win = getCurrentWindow();
    await win.setSize(new LogicalSize(profile.width, profile.height));
    await win.center();
  } catch {
    // Ignore error - likely running in a plain browser environment
  }
}
