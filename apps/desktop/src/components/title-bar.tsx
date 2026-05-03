/**
 * Custom frameless title bar with native window controls.
 * Rendered on auth and app windows (not the intro splash).
 *
 * The `data-tauri-drag-region` attribute makes the bar drag-to-move the window.
 */

import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import "../styles/title-bar.css";

async function minimize() {
  try {
    await getCurrentWindow().minimize();
  } catch {
    // Window controls only work in Tauri context
  }
}

async function maximize() {
  try {
    const win = getCurrentWindow();
    const isMaximized = await win.isMaximized();
    if (isMaximized) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  } catch {
    // Window controls only work in Tauri context
  }
}

async function close() {
  try {
    await getCurrentWindow().close();
  } catch {
    // Window controls only work in Tauri context
  }
}

export function TitleBar() {
  return (
    <header className="title-bar" data-tauri-drag-region>
      {/* Drag region fills the bar — controls are excluded from dragging */}
      <div className="title-bar-logo" data-tauri-drag-region>
        <span className="title-bar-wordmark">LARITY</span>
      </div>

      <div className="title-bar-controls">
        <button
          aria-label="Minimize"
          className="title-bar-btn"
          onClick={minimize}
          type="button"
        >
          <Minus size={11} strokeWidth={1.5} />
        </button>
        <button
          aria-label="Maximize"
          className="title-bar-btn"
          onClick={maximize}
          type="button"
        >
          <Square size={10} strokeWidth={1.5} />
        </button>
        <button
          aria-label="Close"
          className="title-bar-btn title-bar-btn--close"
          onClick={close}
          type="button"
        >
          <X size={11} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
