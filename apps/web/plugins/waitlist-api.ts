import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { config } from "dotenv";
import { Resend } from "resend";
import type { Plugin } from "vite";

config();
console.log("[waitlist-api] Loaded .env from", resolve(process.cwd(), ".env"));

const localEnv = resolve(process.cwd(), ".env.local");
if (existsSync(localEnv)) {
  config({ path: localEnv, override: true });
  console.log("[waitlist-api] Loaded overrides from", localEnv);
}

async function parseBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

async function handleWaitlist(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { success: false, error: "Method not allowed" });
    return;
  }

  let body: { email?: string };
  try {
    body = (await parseBody(req)) as { email?: string };
  } catch {
    sendJson(res, 400, { success: false, error: "Invalid request body" });
    return;
  }

  const { email } = body;
  if (!email?.includes("@")) {
    sendJson(res, 400, { success: false, error: "Invalid email address" });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY is not configured");
    sendJson(res, 500, {
      success: false,
      error: "Email service not configured",
    });
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const personalEmail = process.env.PERSONAL_EMAIL || "delivered@resend.dev";
    const timestamp = new Date().toISOString();

    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: personalEmail,
      subject: "New Larity Waitlist Signup",
      html: `<p>A new user has joined the Larity waitlist!</p><p>Email: <strong>${email}</strong></p><p>Signed up at: ${timestamp}</p>`,
    });

    console.log(`Waitlist notification sent to ${personalEmail} for ${email}`);
    sendJson(res, 200, { success: true });
  } catch (error) {
    console.error("Failed to send waitlist email:", error);
    sendJson(res, 500, {
      success: false,
      error: "Failed to send email notification",
    });
  }
}

export function waitlistApiPlugin(): Plugin {
  return {
    name: "waitlist-api",
    configureServer(server) {
      server.middlewares.use("/api/waitlist", handleWaitlist);
    },
  };
}
