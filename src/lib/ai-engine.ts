import { db } from "./firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

/**
 * AI Analytics Engine for School SaaS (v2.0)
 * All OpenAI calls are proxied through /api/ai-insights (server-side key).
 * The VITE_OPENAI_API_KEY is NEVER used here — it should not exist in .env.
 */

export type AIFeature =
  | "subject_performance"
  | "section_performance"
  | "topper_logic"
  | "marks_distribution"
  | "risk_analysis"
  | "academic_status";

interface AIInsightResponse {
  subject_insights:     any[];
  trend_predictions:    string[];
  risk_students:        any[];
  topper_analysis:      any[];
  recommended_actions:  string[];
}

// ── Internal proxy call ────────────────────────────────────────────────────────
// All requests go through the Vercel serverless function which holds the key.
async function callAIProxy(data: any, instructions: string): Promise<AIInsightResponse> {
  const response = await fetch("/api/ai-insights", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ data, instructions }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `AI Proxy Error: ${response.status}`);
  }

  return response.json();
}

// ── Main engine (with Firestore 24-hour cache) ────────────────────────────────
export const aiEngine = {
  async getInsights({ feature, schoolId, data, forceRefresh = false }: {
    feature: AIFeature; schoolId: string; data: any; forceRefresh?: boolean;
  }) {
    // 1. Check Firestore cache (24-hour TTL)
    if (!forceRefresh) {
      const cacheRef = doc(db, "ai_insights", `${schoolId}_${feature}`);
      try {
        const cacheSnap = await getDoc(cacheRef);
        if (cacheSnap.exists()) {
          const cached = cacheSnap.data();
          const now = new Date();
          if (
            cached.lastUpdated &&
            now.getTime() - cached.lastUpdated.toDate().getTime() < 86_400_000
          ) {
            console.info(`[AI CACHE] Hit: ${feature}`);
            return cached.content;
          }
        }
      } catch {
        console.warn("[AI CACHE] Read failed — proceeding with live call.");
      }
    }

    // 2. Build prompt
    const instructions = this.generateSystemPrompt(feature);

    // 3. Call via server-side proxy
    console.info(`[AI] Calling proxy for feature: ${feature}`);
    const insights = await callAIProxy(data, instructions);

    // 4. Persist to cache
    try {
      const cacheRef = doc(db, "ai_insights", `${schoolId}_${feature}`);
      await setDoc(cacheRef, {
        schoolId,
        feature,
        content:     insights,
        lastUpdated: serverTimestamp(),
      });
    } catch {
      console.warn("[AI CACHE] Write failed — result not cached.");
    }

    return insights;
  },

  generateSystemPrompt(feature: AIFeature): string {
    const ctx = `Senior Academic Analyst Mode. Return ONLY valid JSON containing standard fields like "subject_insights", "trend_predictions", "recommended_actions", PLUS specific keys for the requested task. `;

    switch (feature) {
      case "subject_performance":
        return ctx + `Task: Detect weak topics and performance trends. MUST include a "weak_sections" array of objects { name: string, avg: string, sections: string, students: string }.`;
      case "marks_distribution":
        return ctx + `Task: Student marks distribution. MUST include a "distribution" array of objects { range: string, students: number, color: string }.`;
      case "section_performance":
        return ctx + `Task: Section-wise analysis. MUST include a "sections" array of objects { section: string, value: number, color: string }.`;
      case "topper_logic":
        return ctx + `Task: Identify top performers. MUST include a "toppers" array of objects { name: string, class: string, grade: string, score: number, gpa: number, avatarBg: string, title: string, trend: string }.`;
      case "risk_analysis":
        return ctx + `Task: Predict falling grades and intervention steps.`;
      default:
        return ctx + `Task: Provide overall academic health summary.`;
    }
  },
};

// ── Session-cached analytics (for per-student badge / curriculum / drill-down) ─
const sessionCache: Record<string, any> = {};

export async function generateAcademicInsights(
  data: any,
  featureType: "status_badging" | "curriculum_tracking" | "drill_down_analysis",
): Promise<any> {
  const cacheKey = `${featureType}_${JSON.stringify(data).substring(0, 100)}`;
  if (sessionCache[cacheKey]) {
    console.info(`[AI SESSION CACHE] Hit: ${featureType}`);
    return sessionCache[cacheKey];
  }

  let instructions = "Senior Academic Analyst Mode. Return strictly valid JSON. ";

  if (featureType === "status_badging") {
    instructions +=
      `Goal: Automatically assign performance badges to students. ` +
      `Logic: >=85 = 'Star Performer', 70-84 = 'Consistent Learner', 50-69 = 'Needs Improvement', <50 = 'At Risk'. ` +
      `Output format MUST be strictly: { "badge": "string", "reason": "string" }`;
  } else if (featureType === "curriculum_tracking") {
    instructions +=
      `Goal: Analyze syllabus completion and highlight gaps. ` +
      `Task: Calculate completion %, identify lagging subjects, suggest actions. ` +
      `Output format MUST be strictly: { "completion_percentage": number, "status": "string", "recommendation": "string" }`;
  } else if (featureType === "drill_down_analysis") {
    instructions +=
      `Goal: Deep insights into subject-level performance. ` +
      `Task: Identify key problem areas, strengths, and suggest strategies. ` +
      `Output format MUST be strictly: { "subject_insight": "string", "strengths": ["string"], "improvement_focus": ["string"], "recommendation": "string" }`;
  }

  const result = await callAIProxy(data, instructions);
  sessionCache[cacheKey] = result;
  return result;
}
