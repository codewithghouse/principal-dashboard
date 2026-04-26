// api/diagnostics.js — one-shot health check for the AI insights pipeline.
//
// Hit this from the browser when you're authenticated. It reports:
//   - Which Firebase project the Vercel admin SDK was initialized with
//   - Which Firebase project the caller's ID token claims to be from
//   - Whether they match (most common cause of /api/ai-insights 401)
//   - Whether the user has a `role` custom claim (required by ai-insights)
//   - Whether OPENAI_API_KEY is set on the Vercel side
//
// Returns 200 with diagnostic JSON in all cases (even on auth failure) so the
// caller can compare project IDs without first fixing auth.
import { applyCors, initAdmin } from "./_auth.js";

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // Resolve the project_id the admin SDK is configured with. Read it from the
  // raw env JSON so we don't depend on initAdmin succeeding.
  let adminProjectId = null;
  let adminInitError = null;
  try {
    const sa = process.env.FIREBASE_ADMIN_SA_JSON;
    if (sa) adminProjectId = JSON.parse(sa).project_id || null;
  } catch (err) {
    adminInitError = `FIREBASE_ADMIN_SA_JSON is not valid JSON: ${err?.message}`;
  }

  const openaiKeySet = !!process.env.OPENAI_API_KEY;
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "(default list)").trim();

  const authz = req.headers.authorization || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7).trim() : null;

  if (!token) {
    return res.status(200).json({
      step: "no-token",
      adminProjectId,
      adminInitError,
      openaiKeySet,
      allowedOrigins,
      hint: "Send Authorization: Bearer <firebase-id-token> to see token-side diagnostics.",
    });
  }

  // Decode the JWT payload locally (no signature check) so we can show the
  // token's project even when verifyIdToken would reject it.
  let unverifiedTokenProjectId = null;
  let unverifiedRole = null;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    unverifiedTokenProjectId = payload.aud || null;
    unverifiedRole = payload.role || null;
  } catch {}

  try {
    const a = initAdmin();
    const decoded = await a.auth().verifyIdToken(token);
    const tokenProjectId = decoded.aud || unverifiedTokenProjectId;
    const role = decoded.role || null;
    return res.status(200).json({
      step: "verified",
      adminProjectId,
      tokenProjectId,
      projectMatch: !!adminProjectId && tokenProjectId === adminProjectId,
      uid: decoded.uid,
      role,
      hasRoleClaim: !!role,
      roleAllowedForAI: role === "principal" || role === "owner",
      openaiKeySet,
      allowedOrigins,
      hint:
        !role ? "User has no `role` custom claim — /api/ai-insights will 403."
        : (role !== "principal" && role !== "owner") ? `Role "${role}" is not in the AI allowlist — only principal/owner can call /api/ai-insights.`
        : !openaiKeySet ? "OPENAI_API_KEY is not set in Vercel."
        : "All green — /api/ai-insights should work for this user.",
    });
  } catch (err) {
    const code = err?.code || "auth/unknown";
    const projectMatch = !!adminProjectId && unverifiedTokenProjectId === adminProjectId;
    return res.status(200).json({
      step: "verify-failed",
      adminProjectId,
      tokenProjectId: unverifiedTokenProjectId,
      projectMatch,
      verifyErrorCode: code,
      verifyErrorMessage: typeof err?.message === "string" ? err.message.slice(0, 300) : undefined,
      openaiKeySet,
      allowedOrigins,
      hint: !projectMatch
        ? `Project mismatch: your token is from "${unverifiedTokenProjectId}", but Vercel's FIREBASE_ADMIN_SA_JSON is for "${adminProjectId}". Update the env var with a service account from the "${unverifiedTokenProjectId}" project.`
        : code === "auth/id-token-expired"
        ? "Token expired — sign out and back in, or call getIdToken(true) to force refresh."
        : `Token verification failed (${code}). Check that FIREBASE_ADMIN_SA_JSON is valid and from the right project.`,
    });
  }
}
