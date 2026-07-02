import { logger } from "./logger";

// ── Email delivery (Resend HTTP API, zero-dependency) ─────────────────────────
// Uses global fetch (Node 20+), so no npm dependency and no lockfile change (the
// CI runs `pnpm install --frozen-lockfile`). SMTP could be added later via
// nodemailer behind this same interface.
//
// SAFETY: this is the ONLY gate on real sending. The reminder scheduler ticks
// every 60s, so the moment a provider key is present in the environment the
// background loop starts emailing real overdue-invoice customers automatically —
// there is no per-send confirmation. Leave the env unset to stay in simulation.

export type EmailStatus = "sent" | "failed" | "simulated";
export interface EmailResult {
  status: EmailStatus;
  detail?: string;
}
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

// Read an env var, treating empty / whitespace-only as unset (fail-safe).
function envValue(name: string): string | undefined {
  const v = process.env[name];
  if (v == null) return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function fromAddress(): string {
  return envValue("REMINDER_FROM_EMAIL") ?? envValue("EMAIL_FROM") ?? "reminders@astram.local";
}

/**
 * Whether a real email provider is configured. Fail-safe: a missing OR
 * empty/whitespace-only key counts as "not configured" → simulation mode.
 */
export function emailProviderConfigured(): boolean {
  return envValue("RESEND_API_KEY") !== undefined;
}

/**
 * Send one email. With no provider key this is a no-op returning "simulated"
 * (nothing leaves the server). With RESEND_API_KEY set it sends for real.
 */
export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const apiKey = envValue("RESEND_API_KEY");
  if (!apiKey) return { status: "simulated" };

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
      }),
    });
    if (!resp.ok) {
      logger.error({ status: resp.status }, "email provider rejected send");
      return { status: "failed", detail: `resend ${resp.status}` };
    }
    return { status: "sent" };
  } catch (err) {
    logger.error({ err }, "email provider send threw");
    return { status: "failed", detail: "network error" };
  }
}
