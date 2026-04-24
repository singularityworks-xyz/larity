import { createAuthClient } from "better-auth/react";

const controlUrl = import.meta.env.VITE_CONTROL_URL ?? "http://localhost:3000";

export const authClient = createAuthClient({
  baseURL: controlUrl,
  basePath: "/auth",
  fetchOptions: {
    credentials: "include",
  },
});

export const { signIn, signOut, signUp, useSession } = authClient;
