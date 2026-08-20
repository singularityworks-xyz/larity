import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const host = process.env.TAURI_DEV_HOST;
  const env = loadEnv(mode, process.cwd(), "");

  // Fail fast on missing production endpoints instead of shipping a build
  // that silently degrades to localhost/127.0.0.1 for end users.
  if (mode === "production") {
    const required = ["VITE_CONTROL_URL", "VITE_WS_URL"] as const;
    for (const key of required) {
      if (!env[key]?.trim()) {
        throw new Error(
          `${key} is required for production builds. Set it in CI secrets or .env.production.`
        );
      }
    }
  }

  return {
    plugins: [tailwindcss(), react()],

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
      port: 1420,
      strictPort: true,
      host,
      // These headers allow the secondary overlay WebviewWindow (which also
      // loads from localhost:1420) to satisfy COEP if it is ever re-enabled,
      // and prevent resource-blocking on the overlay page.
      headers: {
        "Cross-Origin-Resource-Policy": "same-origin",
        "Cross-Origin-Opener-Policy": "same-origin",
      },
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // 3. tell Vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});
