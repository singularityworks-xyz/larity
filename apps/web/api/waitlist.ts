import type { IncomingMessage, ServerResponse } from "node:http";
import { Resend } from "resend";

async function parseBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, error: "Method not allowed" }));
    return;
  }

  let body: { email?: string };
  try {
    body = (await parseBody(req)) as { email?: string };
  } catch {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, error: "Invalid request body" }));
    return;
  }

  const { email } = body;
  if (!email?.includes("@")) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, error: "Invalid email address" }));
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const personalEmail = process.env.PERSONAL_EMAIL;
  if (!(apiKey && personalEmail)) {
    console.error("Missing RESEND_API_KEY or PERSONAL_EMAIL");
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({ success: false, error: "Email service not configured" })
    );
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const timestamp = new Date().toISOString();

    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: personalEmail,
      subject: "New Larity Waitlist Signup",
      html: `<p>A new user has joined the Larity waitlist!</p><p>Email: <strong>${email}</strong></p><p>Signed up at: ${timestamp}</p>`,
    });

    console.log(`Waitlist notification sent to ${personalEmail} for ${email}`);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: true }));
  } catch (error) {
    console.error("Failed to send waitlist email:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        error: "Failed to send email notification",
      })
    );
  }
}
