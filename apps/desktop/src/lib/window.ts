import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

export interface WindowProfile {
  center?: boolean;
  height: number;
  width: number;
}

export const WINDOW_PROFILES = {
  intro: { width: 380, height: 520 },
  auth: { width: 860, height: 560 },
  app: { width: 1200, height: 750 },
} satisfies Record<string, WindowProfile>;

export interface WindowSizeConstraints {
  minHeight?: number;
  minWidth?: number;
}

export const WINDOW_CONSTRAINTS: WindowSizeConstraints = {
  minWidth: 640,
  minHeight: 480,
};

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
