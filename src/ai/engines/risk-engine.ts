import { getRiskInsightsPrompt } from "../prompts/risk-prompt";

export async function generateRiskInsights(data: any): Promise<any> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI API Key not configured.");
  }

  const prompt = getRiskInsightsPrompt(data);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4.1", 
      input: prompt
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API Error: ${response.status}`);
  }

  const result = await response.json();
  let outputText = result.output || "{}";
  
  // Strip code block markings if present
  outputText = outputText.replace(/```json/g, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(outputText);
  } catch (parseError) {
    console.error("Risk Analytics Engine failed to parse JSON:", outputText);
    return null;
  }
}
