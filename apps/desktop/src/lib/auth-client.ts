import { createAuthClient } from "better-auth/react";
import { CONTROL_URL } from "./env";
import { getStoredSessionToken } from "./session-token";

const controlUrl = CONTROL_URL;

import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export const authClient = createAuthClient({
  baseURL: controlUrl,
  basePath: "/auth",
  fetchOptions: {
    credentials: "include",
    auth: {
      type: "Bearer",
      token: () => getStoredSessionToken() ?? undefined,
    },
    customFetchImpl: (...args) => {
      if (isTauri()) {
        return tauriFetch(...args);
      }
      return fetch(...args);
    },
  },
});

export const { signIn, signOut, signUp, useSession } = authClient;
