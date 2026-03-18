export const getAcademicAnalyticsPrompt = (data: any): string => {
  return `
    You are an academic analytics AI system. Analyze the provided school dataset and return structured insights strictly in JSON format.
    Dataset:
    ${JSON.stringify(data)}

    You must return a STRICT JSON object containing exactly these keys:
    {
      "performance_trend": "Short insights on overall performance.",
      "distribution_summary": "Summary of score distribution patterns.",
      "monthly_trend": "Explanation of monthly progress.",
      "historical_comparison": "Comparison vs previous year performance."
    }

    Respond ONLY with the JSON object. Do not include markdown code blocks or any other text.
  `;
};
