// api/send-email.js — Vercel serverless. Hardened 2026-04-18.
//
// Principal-dashboard email sender. Previously accepted raw `html` from the
// client body — now uses server-side templates keyed by `type`.
import { applyCors, requireAuth, requireRole, escapeHtml, boundString, isValidEmail, rateLimit } from "./_auth.js";

const MAX_SUBJECT = 200;
const MAX_NAME    = 120;
const MAX_REASON  = 1000;
const MAX_SCHOOL  = 200;

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const decoded = await requireAuth(req, res);
  if (!decoded) return;
  if (!requireRole(decoded, ["owner", "principal"], res)) return;

  if (!rateLimit(`send-email:${decoded.uid}`, 30)) {
    return res.status(429).json({ error: "Too many requests." });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Email service not configured." });

  const {
    type,        // 'deo_approved' | 'deo_rejected'
    to,
    name,
    schoolName,
    subject,
    rejectReason,
    allowedPages, // array of { label } — server renders list
    loginUrl,
  } = req.body || {};

  if (!isValidEmail(to)) return res.status(400).json({ error: "Invalid recipient email." });

  const sName   = boundString(name, MAX_NAME);
  const sSchool = boundString(schoolName, MAX_SCHOOL);
  const sSubj   = boundString(subject, MAX_SUBJECT) || "Access Request Update";
  const sReason = boundString(rejectReason, MAX_REASON);
  const sLogin  = typeof loginUrl === "string" && /^https?:\/\//.test(loginUrl) ? loginUrl : "";

  let html = "";

  if (type === "deo_approved") {
    const pagesList = Array.isArray(allowedPages)
      ? allowedPages.slice(0, 50).map(p => `<li style="padding:4px 0;">${escapeHtml(boundString(p?.label || p?.path || "", 100))}</li>`).join("")
      : "";
    html = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
        <div style="background:#1e3a8a;padding:20px 24px;border-radius:8px 8px 0 0;margin:-24px -24px 24px;">
          <h2 style="color:white;margin:0;">Access Approved!</h2>
          <p style="color:#93c5fd;margin:4px 0 0;font-size:13px;">${escapeHtml(sSchool || "School Dashboard")}</p>
        </div>
        <p style="color:#334155;">Hi <strong>${escapeHtml(sName)}</strong>,</p>
        <p style="color:#64748b;">Your request for Data Entry access has been <strong style="color:#16a34a;">approved</strong> by the principal.</p>
        ${pagesList ? `<p style="color:#64748b;font-weight:bold;">You now have access to:</p><ul style="color:#334155;">${pagesList}</ul>` : ""}
        ${sLogin ? `<div style="margin:28px 0;text-align:center;">
          <a href="${escapeHtml(sLogin)}" style="background:#1e3a8a;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">Login Now with Google</a>
        </div>` : ""}
        <p style="color:#94a3b8;font-size:12px;">Use your Google account (${escapeHtml(to)}) to sign in.</p>
      </div>
    `;
  } else if (type === "deo_rejected") {
    html = `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
        <h2 style="color:#1e3a8a;">Access Request Decision</h2>
        <p>Hi <strong>${escapeHtml(sName)}</strong>, your access request has been <strong style="color:#dc2626;">declined</strong>.</p>
        ${sReason ? `<p style="color:#64748b;">Reason: ${escapeHtml(sReason)}</p>` : ""}
        <p style="color:#94a3b8;font-size:13px;">Contact your principal for more information.</p>
      </div>
    `;
  } else if (type === "generic_invite") {
    // Generic invitation/notification template. Clients pass structured
    // fields — NO raw HTML accepted. Server escapes everything.
    const { heading, bodyText, ctaUrl, ctaLabel } = req.body || {};
    const sHeading   = boundString(heading, 200) || "Welcome";
    const sBodyText  = boundString(bodyText, 2000);
    const sCtaLabel  = boundString(ctaLabel, 60) || "Open Dashboard";
    const sCtaUrl    = typeof ctaUrl === "string" && /^https?:\/\//.test(ctaUrl)
                       ? ctaUrl.slice(0, 500)
                       : "";

    html = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="background:#1e3a8a;padding:24px 28px;">
          <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;letter-spacing:0.5px;">EDULLENT</h1>
          <p style="color:#bfdbfe;margin:4px 0 0;font-size:13px;">${escapeHtml(sSchool || "School Portal")}</p>
        </div>
        <div style="padding:28px;background:#fff;">
          <h2 style="color:#1e293b;margin:0 0 12px;">${escapeHtml(sHeading)}</h2>
          <p style="color:#334155;">Hi <strong>${escapeHtml(sName)}</strong>,</p>
          <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px;">
            ${escapeHtml(sBodyText).replace(/\n/g, "<br>")}
          </p>
          ${sCtaUrl ? `<div style="text-align:center;margin:24px 0;">
            <a href="${escapeHtml(sCtaUrl)}" style="background:#1e3a8a;color:#fff;padding:13px 30px;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;">${escapeHtml(sCtaLabel)}</a>
          </div>` : ""}
          <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;">
            If you didn't expect this email, please ignore it.
          </p>
        </div>
        <div style="background:#f1f5f9;padding:14px 28px;text-align:center;">
          <p style="color:#94a3b8;font-size:11px;margin:0;">Powered by Edullent Cloud Architecture</p>
        </div>
      </div>
    `;
  } else {
    return res.status(400).json({ error: "Unknown email type." });
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: "Edullent <invite@edulent.dgion.com>",
        to,
        subject: sSubj,
        html,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok) return res.status(200).json({ success: true, id: result.id });
    console.error("[principal send-email] Resend error:", response.status, result);
    return res.status(502).json({ error: "Email provider error." });
  } catch (err) {
    console.error("[principal send-email] Network error:", err);
    return res.status(500).json({ error: "Failed to send email." });
  }
}