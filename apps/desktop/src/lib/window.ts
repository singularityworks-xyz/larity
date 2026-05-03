import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

export interface WindowProfile {
  width: number;
  height: number;
  /** Whether to re-centre the window after resizing. */
  center?: boolean;
}

export const WINDOW_PROFILES = {
  /** Splash / intro — small portrait rectangle */
  intro: { width: 380, height: 520 },
  /** Auth pages — wider landscape rectangle */
  auth: { width: 860, height: 560 },
  /** Main app — full-size, default */
  app: { width: 1200, height: 750 },
} satisfies Record<string, WindowProfile>;

export interface WindowSizeConstraints {
  minWidth?: number;
  minHeight?: number;
}

export const WINDOW_CONSTRAINTS: WindowSizeConstraints = {
  minWidth: 640,
  minHeight: 480,
};

/**
 * Resize the Tauri window to the given profile.
 * Optionally re-centres (default: no — respects user positioning).
 * Falls back gracefully when running outside Tauri.
 */
export async function applyWindowProfile(
  profile: WindowProfile,
  options?: { center?: boolean }
): Promise<void> {
  try {
    const win = getCurrentWindow();
    await win.setSize(
      new LogicalSize(
        Math.max(profile.width, WINDOW_CONSTRAINTS.minWidth ?? 0),
        Math.max(profile.height, WINDOW_CONSTRAINTS.minHeight ?? 0)
      )
    );
    if (options?.center) {
      await win.center();
    }
  } catch {
    // Ignore — likely running in a plain browser
  }
}
