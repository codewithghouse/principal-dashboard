import { db } from "./firebase";
import { doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";

/**
 * AI Engine for Principal Dashboard
 * Powered by GPT-4o-mini
 * Includes built-in caching to save tokens
 */

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export type AIFeature = 
  | "subject_performance"
  | "section_comparison"
  | "weak_section_alert"
  | "academic_status"
  | "curriculum_progress"
  | "risk_analysis"
  | "attendance_engine"
  | "topper_logic"
  | "report_builder";

interface AIRequestOptions {
  feature: AIFeature;
  schoolId: string;
  data: any; // The raw data to analyze
  forceRefresh?: boolean;
}

export const aiEngine = {
  /**
   * Main function to get AI insights for any feature
   */
  async getInsights({ feature, schoolId, data, forceRefresh = false }: AIRequestOptions) {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

    if (!apiKey) {
      console.error("OpenAI API Key is missing");
      return { error: "AI services not configured" };
    }

    // 1. Check Cache First (Firestore)
    if (!forceRefresh) {
      const cachedData = await this.checkCache(schoolId, feature);
      if (cachedData) {
        console.log(`[AI Engine] Using cached data for ${feature}`);
        return cachedData;
      }
    }

    // 2. No cache or force refresh, call OpenAI
    console.log(`[AI Engine] Calling GPT-4o-mini for ${feature}`);
    try {
      const prompt = this.generatePrompt(feature, data);
      
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { 
              role: "system", 
              content: "You are an expert School Academic Analyst. You only output valid JSON based on the provided schema. No markdown, no conversational text." 
            },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" }
        }),
      });

      const result = await response.json();
      const aiResponse = JSON.parse(result.choices[0].message.content);

      // 3. Save to Cache
      await this.saveCache(schoolId, feature, aiResponse);

      return aiResponse;
    } catch (error) {
      console.error(`[AI Engine] Error in ${feature}:`, error);
      throw error;
    }
  },

  /**
   * Checks Firestore if an insight already exists for today
   */
  async checkCache(schoolId: string, feature: string) {
    try {
      const cacheRef = doc(db, "ai_insights", `${schoolId}_${feature}`);
      const cacheSnap = await getDoc(cacheRef);

      if (cacheSnap.exists()) {
        const data = cacheSnap.data();
        const lastUpdated = data.lastUpdated?.toDate();
        const now = new Date();

        // If data is less than 24 hours old, use it
        if (lastUpdated && (now.getTime() - lastUpdated.getTime()) < 24 * 60 * 60 * 1000) {
          return data.content;
        }
      }
      return null;
    } catch (error) {
      console.error("Cache check error:", error);
      return null;
    }
  },

  /**
   * Saves AI insights to Firestore
   */
  async saveCache(schoolId: string, feature: string, content: any) {
    try {
      const cacheRef = doc(db, "ai_insights", `${schoolId}_${feature}`);
      await setDoc(cacheRef, {
        schoolId,
        feature,
        content,
        lastUpdated: serverTimestamp()
      });
    } catch (error) {
      console.error("Cache save error:", error);
    }
  },

  /**
   * Prompt Generator - Templates for each feature
   */
  generatePrompt(feature: AIFeature, data: any): string {
    const dataStr = JSON.stringify(data);
    
    switch (feature) {
      case "subject_performance":
        return `Analyze the following subject data and provide performance scores, trends, and improvement tags.
          Data: ${dataStr}
          Output Schema: { "subjectScores": [{ "subject": string, "performance": number, "trend": "up"|"down"|"stable", "tags": string[] }] }`;
      
      case "topper_logic":
        return `Identify the top performing students across all grades from this data.
          Data: ${dataStr}
          Output Schema: { "toppers": [{ "name": string, "grade": string, "rank": number, "achievement": string }] }`;
          
      case "risk_analysis":
        return `Identify at-risk students based on attendance and academic data. 
          Provide a severity level and primary risk factor.
          Data: ${dataStr}
          Output Schema: { "atRisk": [{ "name": string, "level": "CRITICAL"|"WARNING", "factor": string, "actionPlan": string }] }`;

      default:
        return `Analyze this school data and provide insights: ${dataStr}`;
    }
  }
};
