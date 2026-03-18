export const getRiskInsightsPrompt = (data: any): string => {
  return `
    You are a Risk Prediction Engine for a School ERP Principal Dashboard.
    Analyze the following student dataset (containing attendance, academic performance, and behavioral incident data):
    ${JSON.stringify(data)}

    You must return a STRICT JSON object containing exactly these keys:
    {
      "chronic_absentees": [{"student": "Name", "reason": "Reason for flagging"}],
      "attendance_risk": [{"student": "Name", "risk_level": "Low/Moderate/High", "reason": "Reason for attendance warning"}],
      "forecast_summary": "Short 30-day attendance forecast based on recent trends.",
      "at_risk_students": [{"student": "Name", "risk_level": "Critical/Warning", "factors": ["Low attendance", "Declining academic performance..."]}]
    }

    Respond ONLY with the JSON object. Do not include markdown code blocks or any other text.
  `;
};
