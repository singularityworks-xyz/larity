import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware } from "better-auth/api";
import { bearer, organization } from "better-auth/plugins";
import { env } from "../env";
import { prisma } from "./prisma";

export const auth = betterAuth({
  basePath: "/auth",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      orgId: {
        type: "string",
        required: false,
        input: true,
      },
      role: {
        type: "string",
        required: false,
        defaultValue: "MEMBER",
        input: false,
      },
      timezone: {
        type: "string",
        required: false,
        input: true,
      },
    },
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID as string,
      clientSecret: env.GOOGLE_CLIENT_SECRET as string,
    },
    github: {
      clientId: env.GITHUB_CLIENT_ID as string,
      clientSecret: env.GITHUB_CLIENT_SECRET as string,
    },
  },
  plugins: [organization(), bearer()],
  trustedOrigins: env.FRONTEND_ORIGINS,
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const headers = (
        ctx.context as unknown as {
          responseHeaders?: Headers;
        }
      ).responseHeaders;
      if (!headers) {
        return;
      }
      const rawLocation = headers.get("Location") ?? headers.get("location");
      if (!rawLocation) {
        return;
      }
      // Strict allow-list: only the exact desktop callback, no path traversal or extra host.
      let url: URL;
      try {
        url = new URL(rawLocation);
      } catch {
        return;
      }
      if (
        url.protocol !== "larity:" ||
        url.host !== "auth" ||
        url.pathname !== "/callback"
      ) {
        return;
      }
      if (url.searchParams.has("token")) {
        return;
      }
      const setCookie = headers.get("set-cookie") ?? headers.get("Set-Cookie");
      if (!setCookie) {
        return;
      }
      const authCookies = (
        ctx.context as unknown as {
          authCookies?: { sessionToken?: { name?: string } };
        }
      ).authCookies;
      const cookieName =
        authCookies?.sessionToken?.name ?? "better-auth.session_token";
      const escapedName = cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = setCookie.match(new RegExp(`${escapedName}=([^;]+)`));
      const rawValue = match?.[1];
      if (!rawValue) {
        return;
      }
      let token: string;
      try {
        token = decodeURIComponent(rawValue);
      } catch {
        token = rawValue;
      }
      if (!token || token.length < 32 || token.length > 512) {
        return;
      }
      if (!/^[A-Za-z0-9_.-]+$/.test(token)) {
        return;
      }
      // `URLSearchParams.set` handles encoding; token is bearer material — never log it.
      url.searchParams.set("token", token);
      headers.set("Location", url.toString());
    }),
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
    },
  },
});

export type Session = typeof auth.$Infer.Session;
