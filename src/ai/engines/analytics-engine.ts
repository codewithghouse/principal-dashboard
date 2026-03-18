import { getAcademicAnalyticsPrompt } from "../prompts/analytics-prompt";

export async function generateAcademicAnalytics(data: any): Promise<any> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI API Key not configured.");
  }

  const prompt = getAcademicAnalyticsPrompt(data);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: prompt,
      text: {
        format: {
          type: "json_object"
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API Error: ${response.status}`);
  }

  const result = await response.json();
  let outputText = result.output || result.text || "{}";
  
  // Clean markdown block if present
  outputText = outputText.replace(/```json/g, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(outputText);
  } catch (parseError) {
    console.error("Engine failed to parse JSON:", outputText);
    return null;
  }
}
