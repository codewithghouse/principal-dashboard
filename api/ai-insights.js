// api/ai-insights.js — Vercel serverless function
// OpenAI key lives ONLY here (process.env.OPENAI_API_KEY).
// Client code sends { instructions, data } — key is never exposed.

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL      = "gpt-4.1-mini";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[AI] OPENAI_API_KEY not set in Vercel environment variables.");
    return res.status(500).json({ error: "AI service not configured." });
  }

  const { instructions, data } = req.body;
  if (!instructions || data === undefined) {
    return res.status(400).json({ error: "instructions and data are required." });
  }

  console.log(`[AI] Request — model: ${MODEL}, data size: ${JSON.stringify(data).length} chars`);

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:        MODEL,
        instructions: instructions,
        input:        `Analyze the academic dataset and return results strictly in JSON format. Data: ${JSON.stringify(data)}`,
        text:         { format: { type: "json_object" } },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("[AI] OpenAI error:", err);
      return res.status(502).json({ error: err.error?.message || `OpenAI error ${response.status}` });
    }

    const result = await response.json();
    const rawContent =
      result.output?.[0]?.content ||
      result.response?.content    ||
      result.choices?.[0]?.message?.content;

    if (!rawContent) {
      return res.status(502).json({ error: "Empty response from AI." });
    }

    const parsed = typeof rawContent === "string" ? JSON.parse(rawContent) : rawContent;
    console.log("[AI] Success.");
    return res.status(200).json(parsed);
  } catch (e) {
    console.error("[AI] Handler error:", e);
    return res.status(500).json({ error: "AI processing failed." });
  }
}
