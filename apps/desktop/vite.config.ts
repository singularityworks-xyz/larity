import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const host = process.env.TAURI_DEV_HOST;
  const env = loadEnv(mode, process.cwd(), "");

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

    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host,
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
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});
