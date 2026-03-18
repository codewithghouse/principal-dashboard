import { db } from "./firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

/**
 * Modern AI Analytics Engine for School SaaS (v1.4)
 * Production-Ready for OpenAI Responses API
 * Model: gpt-4.1-mini
 */

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const PRIMARY_MODEL = "gpt-4.1-mini";

export type AIFeature = 
  | "subject_performance"
  | "section_performance"
  | "topper_logic"
  | "marks_distribution"
  | "risk_analysis"
  | "academic_status";

interface AIInsightResponse {
  subject_insights: any[];
  trend_predictions: string[];
  risk_students: any[];
  topper_analysis: any[];
  recommended_actions: string[];
}

/**
 * Core Service: Directly calls OpenAI Responses API
 * Optimized for gpt-4.1-mini and text.format parameter
 */
export async function fetchAIInsights(data: any, instructions: string): Promise<AIInsightResponse> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("VITE_OPENAI_API_KEY configuration missing.");
  }

  const requestBody = {
    model: PRIMARY_MODEL,
    instructions: instructions,
    input: `Analyze the academic dataset and return results strictly in JSON format. Data: ${JSON.stringify(data)}`,
    text: {
      format: {
        type: "json_object"
      }
    }
  };

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || `OpenAI API Error: ${response.status}`);
  }

  const result = await response.json();
  
  // Adaptive parsing for Responses API output structure
  const rawContent = result.output?.[0]?.content || result.response?.content || result.choices?.[0]?.message?.content;
  
  if (!rawContent) throw new Error("Received empty response from AI Engine.");

  return typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
}

/**
 * Principal Dashboard Service Engine
 */
export const aiEngine = {
  async getInsights({ feature, schoolId, data, forceRefresh = false }: any) {
    
    // 1. Intelligent Cache Layer
    if (!forceRefresh) {
      const cacheRef = doc(db, "ai_insights", `${schoolId}_${feature}`);
      try {
        const cacheSnap = await getDoc(cacheRef);
        if (cacheSnap.exists()) {
          const cached = cacheSnap.data();
          const now = new Date();
          // 24-hour TTL for performance
          if (cached.lastUpdated && (now.getTime() - cached.lastUpdated.toDate().getTime()) < 86400000) {
             console.info(`%c ⚡ [AI CACHE] Loaded ${feature} `, 'background: #0ea5e9; color: #fff; padding: 2px 8px; border-radius: 4px;');
             return cached.content;
          }
        }
      } catch (e) {
        console.warn("Cache fetch failed, proceeding with live AI call.");
      }
    }

    // 2. Generate Contextual Instructions
    const instructions = this.generateSystemPrompt(feature);

    // 3. Live AI Processing
    console.info(`%c 🤖 [MODERN AI] Processing ${feature} with GPT-4.1-mini... `, 'background: #6366f1; color: #fff; padding: 2px 8px; border-radius: 4px;');
    
    try {
      const insights = await fetchAIInsights(data, instructions);

      // 4. Persistence
      const cacheRef = doc(db, "ai_insights", `${schoolId}_${feature}`);
      await setDoc(cacheRef, {
        schoolId,
        feature,
        content: insights,
        lastUpdated: serverTimestamp()
      });

      return insights;
    } catch (error: any) {
      console.error(`%c ❌ [AI FAILURE] ${error.message} `, 'background: #ef4444; color: #fff; padding: 2px 8px;');
      throw error;
    }
  },

  generateSystemPrompt(feature: AIFeature): string {
    const context = `Senior Academic Analyst Mode. Return ONLY valid JSON containing standard fields like "subject_insights", "trend_predictions", "recommended_actions", PLUS specific keys for the requested task. `;
    
    switch (feature) {
      case "subject_performance":
        return context + `Task: Detect weak topics and performance trends.`;
      case "marks_distribution":
        return context + `Task: Student marks distribution. MUST include a "distribution" array of objects { range: string, students: number, color: string }.`;
      case "section_performance":
        return context + `Task: Section-wise analysis. MUST include a "sections" array of objects { section: string, value: number, color: string }.`;
      case "topper_logic":
        return context + `Task: Identify top performers. MUST include a "toppers" array of objects { name: string, class: string, grade: string, score: number, gpa: number, avatarBg: string, title: string, trend: string }.`;
      case "risk_analysis":
        return context + `Task: Predict falling grades and intervention steps.`;
      default:
        return context + `Task: Provide overall academic health summary.`;
    }
  }
};
