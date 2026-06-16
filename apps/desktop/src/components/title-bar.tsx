import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Moon, Square, Sun, X } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../lib/ui";
import { useTheme } from "./theme-provider";

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

export function TitleBar({ children }: { children?: ReactNode }) {
  const titleBarButtonClass =
    "flex h-full w-[46px] cursor-pointer items-center justify-center rounded-none border-0 bg-transparent p-0 text-neutral-700 dark:text-neutral-400 transition-colors duration-[140ms] ease-in [-webkit-app-region:no-drag] [app-region:no-drag] hover:bg-black/5 hover:text-neutral-900 dark:hover:bg-white/6 dark:hover:text-neutral-100 active:bg-black/4 dark:active:bg-white/4";

  const { theme, toggleTheme } = useTheme();

  return (
    <header
      className="fixed inset-x-0 top-0 z-[9999] flex h-9 select-none items-center justify-between bg-transparent pl-4 [-webkit-user-select:none]"
      data-tauri-drag-region
    >
      <div className="flex flex-1 items-center gap-3" data-tauri-drag-region>
        <span className="font-['Share_Tech_Mono','Courier_New',monospace] font-normal text-neutral-700 text-xs tracking-[0.22em] dark:text-neutral-400">
          LARITY
        </span>
        {children}
      </div>

      <div className="flex h-full items-stretch">
        <button
          aria-label="Toggle Theme"
          className={titleBarButtonClass}
          onClick={toggleTheme}
          type="button"
        >
          {theme === "dark" ? (
            <Sun size={11} strokeWidth={1.5} />
          ) : (
            <Moon size={11} strokeWidth={1.5} />
          )}
        </button>
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
