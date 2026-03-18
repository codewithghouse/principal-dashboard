export const getCommunicationPrompt = (data: any): string => {
  return `
    You are a Communication Intelligence Engine. Analyze the provided school dataset and return structured insights strictly in JSON format.
    Dataset:
    ${JSON.stringify(data)}

    You must return a STRICT JSON object containing exactly these keys:
    {
      "message_classification": [
        { "student": "String", "category": "Complaint/Information Request/Concern/Appreciation/General Inquiry", "summary": "String summary" }
      ],
      "department_routing": [
        { "message": "String (Short summary)", "route_to": "Academic/Attendance/Discipline/Administration" }
      ],
      "conversation_context": [
        { "thread_id": "String", "context_summary": "String context deduction" }
      ],
      "broadcast_suggestions": [
        { "target_group": "String", "reason": "String reason" }
      ]
    }

    Respond ONLY with the JSON object. Do not include markdown code blocks or any other text.
  `;
};
