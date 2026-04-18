/**
 * resend.ts — client-side wrapper for /api/send-email.
 *
 * The principal endpoint uses server-side templates keyed by `type`.
 * Clients pass structured fields (name, allowedPages, etc.) — NEVER raw HTML.
 */
import { auth } from "./firebase";

export interface ApprovedEmailPayload {
  to: string;
  name: string;
  schoolName: string;
  subject?: string;
  allowedPages: { label: string; path?: string }[];
  loginUrl?: string;
}

export interface RejectedEmailPayload {
  to: string;
  name: string;
  schoolName: string;
  subject?: string;
  rejectReason?: string;
}

async function post(body: Record<string, unknown>) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch("/api/send-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as any)?.error || `Failed to send email (${response.status})`);
  }
  return data;
}

export const sendDeoApprovedEmail = (p: ApprovedEmailPayload) =>
  post({ type: "deo_approved", ...p });

export const sendDeoRejectedEmail = (p: RejectedEmailPayload) =>
  post({ type: "deo_rejected", ...p });

export interface GenericInvitePayload {
  to: string;
  name: string;
  schoolName: string;
  subject?: string;
  heading: string;
  bodyText: string;
  ctaUrl?: string;
  ctaLabel?: string;
}

export const sendGenericInviteEmail = (p: GenericInvitePayload) =>
  post({ type: "generic_invite", ...p });

/**
 * @deprecated Do NOT pass raw HTML — use sendGenericInviteEmail with
 * structured fields. This shim exists only so legacy call sites compile;
 * it maps the first paragraph of the HTML body to bodyText and sends via
 * the secure generic_invite template. Arbitrary HTML is dropped.
 */
export interface LegacyEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}
export const sendEmail = async (options: LegacyEmailOptions) => {
  const to = Array.isArray(options.to) ? options.to[0] : options.to;
  if (!to) throw new Error("sendEmail: recipient is required");
  const subject = options.subject || "Notification";
  // Strip tags from the legacy HTML body to get a plain-text fallback.
  const stripped = String(options.html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1500);
  console.warn("[resend] legacy sendEmail({html}) call — migrate to sendGenericInviteEmail. Raw HTML dropped.");
  return post({
    type: "generic_invite",
    to,
    name: "there",
    schoolName: "",
    subject,
    heading: subject,
    bodyText: stripped,
  });
};