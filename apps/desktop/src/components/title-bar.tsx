/**
 * Custom frameless title bar with native window controls.
 * Rendered on auth and app windows (not the intro splash).
 *
 * The `data-tauri-drag-region` attribute makes the bar drag-to-move the window.
 */

import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { cx } from "../lib/ui";

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
  const titleBarButtonClass =
    "flex h-full w-[46px] cursor-pointer items-center justify-center rounded-none border-0 bg-transparent p-0 text-[rgba(161,161,161,0.55)] transition-colors duration-[140ms] ease-in [-webkit-app-region:no-drag] [app-region:no-drag] hover:bg-white/6 hover:text-[rgba(237,237,237,0.9)] active:bg-white/4";

  return (
    <header
      className="fixed inset-x-0 top-0 z-[9999] flex h-9 select-none items-center justify-between bg-transparent pl-4 [-webkit-user-select:none]"
      data-tauri-drag-region
    >
      {/* Drag region fills the bar — controls are excluded from dragging */}
      <div className="flex flex-1 items-center gap-2" data-tauri-drag-region>
        <span className="font-['Share_Tech_Mono','Courier_New',monospace] font-normal text-[11px] text-[rgba(161,161,161,0.5)] tracking-[0.22em]">
          LARITY
        </span>
      </div>

      <div className="flex h-full items-stretch">
        <button
          aria-label="Minimize"
          className={titleBarButtonClass}
          onClick={minimize}
          type="button"
        >
          <Minus size={11} strokeWidth={1.5} />
        </button>
        <button
          aria-label="Maximize"
          className={titleBarButtonClass}
          onClick={maximize}
          type="button"
        >
          <Square size={10} strokeWidth={1.5} />
        </button>
        <button
          aria-label="Close"
          className={cx(
            titleBarButtonClass,
            "hover:bg-[#c42b1c] hover:text-white active:bg-[#b52416]"
          )}
          onClick={close}
          type="button"
        >
          <X size={11} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
}
