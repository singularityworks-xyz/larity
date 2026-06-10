import { invoke } from "@tauri-apps/api/core";

import { createLogger } from "./logger";

const OVERLAY_LABEL = "meeting-overlay";
const logger = createLogger("overlay-window");

interface OverlayWindowParams {
  sessionId: string;
  role: string;
  clientName: string;
  meetingTitle: string;
  startedAt: number;
  wsBaseUrl: string;
  userId: string;
}

export async function createOverlayWindow(
  params: OverlayWindowParams
): Promise<void> {
  const searchParams = new URLSearchParams({
    sessionId: params.sessionId,
    role: params.role,
    clientName: params.clientName,
    meetingTitle: params.meetingTitle,
    startedAt: String(params.startedAt),
    wsBaseUrl: params.wsBaseUrl,
    userId: params.userId,
  });

  const base = window.location.origin;
  const url = `${base}/overlay?${searchParams.toString()}`;

  try {
    await invoke("create_overlay_window", { url });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Overlay creation failed", { message: errMsg });
    throw error;
  }
}

export async function closeOverlayWindow(): Promise<void> {
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const existing = await WebviewWindow.getByLabel(OVERLAY_LABEL);
    if (existing) {
      await existing.close();
    }
  } catch {
    // window may already be closed
  }
}
