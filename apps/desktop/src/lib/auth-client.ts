import { createAuthClient } from "better-auth/react";

const controlUrl = import.meta.env.VITE_CONTROL_URL ?? "http://localhost:3000";

import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export const authClient = createAuthClient({
  baseURL: controlUrl,
  basePath: "/auth",
  fetchOptions: {
    credentials: "include",
    customFetchImpl: (...args) => {
      if (isTauri()) {
        return tauriFetch(...args);
      }
      return fetch(...args);
    },
  },
});

export const { signIn, signOut, signUp, useSession } = authClient;
