import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    server: {
      host: "::",
      port: 8081,
      hmr: { overlay: false },

    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      {
        name: 'local-email-middleware',
        configureServer: (server: any) => {
          // HTML-escape mirrors api/_auth.js for parity with prod templates.
          const escapeHtml = (v: any) =>
            String(v ?? "").replace(/[&<>"']/g, (c) => (
              { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any
            )[c]);
          const bound = (v: any, max: number, fallback = "") =>
            (typeof v === "string" ? v.slice(0, max) : fallback);

          // Mirror api/send-email.js — render HTML server-side from typed
          // payload. Keeps dev parity with Vercel prod handler so K-12 +
          // pre-primary invite flows (both ship `type: "generic_invite"`)
          // produce real emails locally.
          const renderTemplate = (body: any): { html: string; subject: string } | { error: string } => {
            const { type, to, name, schoolName, subject } = body || {};
            const sName    = bound(name, 120) || "there";
            const sSchool  = bound(schoolName, 200);
            const sSubject = bound(subject, 200) || "Notification";

            if (type === "generic_invite") {
              const { heading, bodyText, ctaUrl, ctaLabel } = body || {};
              const sHeading  = bound(heading, 200) || "Welcome";
              const sBody     = bound(bodyText, 2000);
              const sLabel    = bound(ctaLabel, 60) || "Open Dashboard";
              const sCtaUrl   = typeof ctaUrl === "string" && /^https?:\/\//.test(ctaUrl)
                                ? ctaUrl.slice(0, 500)
                                : "";
              const html = `
                <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                  <div style="background:#1e3a8a;padding:24px 28px;">
                    <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;letter-spacing:0.5px;">EDULLENT</h1>
                    <p style="color:#bfdbfe;margin:4px 0 0;font-size:13px;">${escapeHtml(sSchool || "School Portal")}</p>
                  </div>
                  <div style="padding:28px;background:#fff;">
                    <h2 style="color:#1e293b;margin:0 0 12px;">${escapeHtml(sHeading)}</h2>
                    <p style="color:#334155;">Hi <strong>${escapeHtml(sName)}</strong>,</p>
                    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px;">
                      ${escapeHtml(sBody).replace(/\n/g, "<br>")}
                    </p>
                    ${sCtaUrl ? `<div style="text-align:center;margin:24px 0;">
                      <a href="${escapeHtml(sCtaUrl)}" style="background:#1e3a8a;color:#fff;padding:13px 30px;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;">${escapeHtml(sLabel)}</a>
                    </div>` : ""}
                    <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;">If you didn't expect this email, please ignore it.</p>
                  </div>
                  <div style="background:#f1f5f9;padding:14px 28px;text-align:center;">
                    <p style="color:#94a3b8;font-size:11px;margin:0;">Powered by Edullent Cloud Architecture</p>
                  </div>
                </div>
              `;
              return { html, subject: sSubject };
            }

            // Unknown type — caller must fall through to the legacy raw-html
            // path; signal "no template" here.
            return { error: `Unknown email type: ${type}` };
          };

          server.middlewares.use(async (req: any, res: any, next: any) => {
            if (req.url?.startsWith("/api/send-email") && req.method === "POST") {
              let body = "";
              req.on("data", (chunk: any) => { body += chunk.toString(); });
              req.on("end", async () => {
                try {
                  const parsed = JSON.parse(body || "{}");
                  const apiKey = env.VITE_RESEND_API_KEY;
                  const to = parsed.to;

                  console.log("\n[EMAIL] /api/send-email called");
                  console.log("[EMAIL] To:", to);
                  console.log("[EMAIL] Type:", parsed.type || "(raw-html legacy)");
                  console.log("[EMAIL] API Key present:", !!apiKey, apiKey ? `(${apiKey.slice(0,8)}...)` : "MISSING");

                  if (!apiKey) {
                    console.error("[EMAIL] ERROR: VITE_RESEND_API_KEY missing in .env");
                    res.statusCode = 500;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({ error: "VITE_RESEND_API_KEY is missing in .env" }));
                    return;
                  }

                  // Resolve subject + html: prefer typed templates, fall back
                  // to legacy raw-html callers (any code path that still sends
                  // `{to, subject, html}` without `type`).
                  let subject: string;
                  let html: string;
                  if (parsed.type) {
                    const rendered = renderTemplate(parsed);
                    if ("error" in rendered) {
                      console.error("[EMAIL] Template error:", rendered.error);
                      res.statusCode = 400;
                      res.setHeader("Content-Type", "application/json");
                      res.end(JSON.stringify({ error: rendered.error }));
                      return;
                    }
                    subject = rendered.subject;
                    html    = rendered.html;
                  } else if (parsed.subject && parsed.html) {
                    subject = parsed.subject;
                    html    = parsed.html;
                  } else {
                    res.statusCode = 400;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({ error: "Missing 'type' or '{subject, html}'." }));
                    return;
                  }

                  const response = await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                      from: "Edullent <invite@edulent.dgion.com>",
                      to: Array.isArray(to) ? to : [to],
                      subject,
                      html,
                    }),
                  });

                  // Read raw text first so we can still log the body even when
                  // Resend's edge (Cloudflare) returns an HTML error page that
                  // doesn't parse as JSON — that's how 520s look.
                  const rawText = await response.text();
                  let result: any = {};
                  try {
                    result = rawText ? JSON.parse(rawText) : {};
                  } catch {
                    result = { _rawSnippet: rawText.slice(0, 400) };
                  }
                  console.log("[EMAIL] Resend response status:", response.status);
                  console.log("[EMAIL] Resend response:", result);

                  res.setHeader("Content-Type", "application/json");
                  res.statusCode = response.status || 200;
                  res.end(
                    JSON.stringify(
                      response.ok
                        ? { success: true, id: result.id }
                        : {
                            error: result?.message || result?._rawSnippet ||
                              `Email provider error (${response.status}).`,
                          }
                    )
                  );
                } catch (err: any) {
                  console.error("[EMAIL] Middleware error:", err.message);
                  res.statusCode = 500;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
            } else {
              next();
            }
          });
        }
      }
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
