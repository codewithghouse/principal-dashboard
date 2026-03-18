import { generateAcademicAnalytics } from "../engines/analytics-engine";
import { generateRiskInsights } from "../engines/risk-engine";
import { generateRecommendations } from "../engines/recommendation-engine";
import { generateCommunicationInsights } from "../engines/communication-engine";

// Memory caches
const analyticsCache = new Map<string, any>();
const riskCache = new Map<string, any>();
const recommendationCache = new Map<string, any>();
const communicationCache = new Map<string, any>();

// Standard response messages
const NO_DATA_MSG = "AI insights will activate automatically once relevant data is available.";
const ERROR_MSG = "AI service temporarily unavailable";

export const AIController = {
  // 1. ACADEMIC ANALYTICS
  async getAcademicAnalytics(data: any): Promise<any> {
    if (!data || Object.keys(data).length === 0 || (Array.isArray(data) && data.length === 0)) {
      return { status: "no_data", message: NO_DATA_MSG };
    }
    let cacheKey = JSON.stringify(data);
    if (analyticsCache.has(cacheKey)) return { status: "success", data: analyticsCache.get(cacheKey) };
    
    try {
      const insights = await generateAcademicAnalytics(data);
      if (!insights) throw new Error("Null response");
      analyticsCache.set(cacheKey, insights);
      return { status: "success", data: insights };
    } catch (error) {
      console.error("[AI Controller] Academic analytics error:", error);
      return { status: "error", message: ERROR_MSG };
    }
  },

  // 2. RISK INTELLIGENCE 
  async getRiskInsights(data: any): Promise<any> {
    if (!data || Object.keys(data).length === 0 || (Array.isArray(data) && data.length === 0)) {
      return { status: "no_data", message: NO_DATA_MSG };
    }
    let cacheKey = JSON.stringify(data);
    if (riskCache.has(cacheKey)) return { status: "success", data: riskCache.get(cacheKey) };
    
    try {
      const insights = await generateRiskInsights(data);
      if (!insights) throw new Error("Null response");
      riskCache.set(cacheKey, insights);
      return { status: "success", data: insights };
    } catch (error) {
      console.error("[AI Controller] Risk error:", error);
      return { status: "error", message: ERROR_MSG };
    }
  },

  // 3. RECOMMENDATION ENGINE
  async getRecommendations(data: any): Promise<any> {
    if (!data || Object.keys(data).length === 0 || (Array.isArray(data) && data.length === 0)) {
      return { status: "no_data", message: NO_DATA_MSG };
    }
    let cacheKey = JSON.stringify(data);
    if (recommendationCache.has(cacheKey)) return { status: "success", data: recommendationCache.get(cacheKey) };
    
    try {
      const insights = await generateRecommendations(data);
      if (!insights) throw new Error("Null response");
      recommendationCache.set(cacheKey, insights);
      return { status: "success", data: insights };
    } catch (error) {
      console.error("[AI Controller] Recommendation error:", error);
      return { status: "error", message: ERROR_MSG };
    }
  },

  // 4. COMMUNICATION INTELLIGENCE ENGINE
  async getCommunicationInsights(data: any): Promise<any> {
    if (!data || Object.keys(data).length === 0 || (Array.isArray(data) && data.length === 0)) {
      return { status: "no_data", message: NO_DATA_MSG };
    }
    let cacheKey = JSON.stringify(data);
    if (communicationCache.has(cacheKey)) return { status: "success", data: communicationCache.get(cacheKey) };
    
    try {
      const insights = await generateCommunicationInsights(data);
      if (!insights) throw new Error("Null response");
      communicationCache.set(cacheKey, insights);
      return { status: "success", data: insights };
    } catch (error) {
      console.error("[AI Controller] Communication error:", error);
      return { status: "error", message: ERROR_MSG };
    }
  }
};
