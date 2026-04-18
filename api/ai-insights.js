// api/ai-insights.js — Vercel serverless. Hardened 2026-04-18.
//
// OpenAI proxy for principal-dashboard AI insights. Requires auth + role gate
// + input size caps + rate limiting to prevent quota burn.
import { applyCors, requireAuth, requireRole, boundString, rateLimit } from "./_auth.js";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL      = "gpt-4.1-mini";

const MAX_INSTRUCTIONS_CHARS = 4000;
const MAX_DATA_CHARS         = 40_000;

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const decoded = await requireAuth(req, res);
  if (!decoded) return;
  if (!requireRole(decoded, ["principal", "owner"], res)) return;

  // Aggressive rate limit — OpenAI calls are expensive.
  if (!rateLimit(`ai-insights:${decoded.uid}`, 10)) {
    return res.status(429).json({ error: "Too many AI requests. Try again in a minute." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "AI service not configured." });

  const { instructions, data } = req.body || {};
  if (typeof instructions !== "string" || !instructions) {
    return res.status(400).json({ error: "instructions is required." });
  }
  if (data === undefined || data === null) {
    return res.status(400).json({ error: "data is required." });
  }

  const sInstructions = boundString(instructions, MAX_INSTRUCTIONS_CHARS);
  const dataJson = JSON.stringify(data);
  if (dataJson.length > MAX_DATA_CHARS) {
    return res.status(400).json({ error: "data payload too large." });
  }

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:        MODEL,
        instructions: sInstructions,
        input:        `Analyze the academic dataset and return results strictly in JSON format. Data: ${dataJson}`,
        text:         { format: { type: "json_object" } },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("[ai-insights] OpenAI error:", response.status, err?.error?.message);
      return res.status(502).json({ error: "AI provider error." });
    }

    const result = await response.json();
    const rawContent =
      result.output?.[0]?.content ||
      result.response?.content    ||
      result.choices?.[0]?.message?.content;

    if (!rawContent) {
      return res.status(502).json({ error: "Empty AI response." });
    }

    let parsed;
    if (typeof rawContent === "string") {
      try { parsed = JSON.parse(rawContent); }
      catch {
        console.warn("[ai-insights] Malformed JSON (first 500):", rawContent.slice(0, 500));
        return res.status(502).json({ error: "AI returned invalid JSON." });
      }
    } else {
      parsed = rawContent;
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("[ai-insights] Handler error:", err);
    return res.status(500).json({ error: "AI processing failed." });
  }
}