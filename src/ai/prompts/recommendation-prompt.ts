export const getRecommendationPrompt = (data: any): string => {
  return `
    You are an AI Recommendation Engine. Analyze the provided school dataset and return structured insights strictly in JSON format.
    Dataset:
    ${JSON.stringify(data)}

    You must return a STRICT JSON object containing exactly these keys:
    {
      "improvement_recommendations": [
        { "subject": "String", "recommendation": "Targeted actionable strategy" }
      ],
      "teacher_effectiveness": [
        { "teacher": "String", "effectiveness_score": 85, "evaluation": "Moderate performance..." }
      ],
      "matched_templates": [
        { "type": "String", "trigger": "String explaining the trigger" }
      ]
    }

    Respond ONLY with the JSON object. Do not include markdown code blocks or any other text.
  `;
};
