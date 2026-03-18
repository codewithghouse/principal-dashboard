import { generateAcademicAnalytics } from "../engines/analytics-engine";
import { generateRiskInsights } from "../engines/risk-engine";
import { generateRecommendations } from "../engines/recommendation-engine";
import { generateCommunicationInsights } from "../engines/communication-engine";

// Separate Memory caches
const analyticsCache = new Map<string, any>();
const riskCache = new Map<string, any>();
const recommendationCache = new Map<string, any>();
const communicationCache = new Map<string, any>();

export const AIController = {
  // 1. ACADEMIC ANALYTICS
  async getAcademicAnalytics(data: any): Promise<any> {
    if (!data || Object.keys(data).length === 0 || (Array.isArray(data) && data.length === 0)) {
      return { status: "no_data", message: "Academic analytics will activate automatically once academic data is available." };
    }
    let cacheKey = "default";
    try { cacheKey = JSON.stringify(data); } catch (e) {}
    if (analyticsCache.has(cacheKey)) { return { status: "success", data: analyticsCache.get(cacheKey) }; }
    try {
      const insights = await generateAcademicAnalytics(data);
      if (!insights) throw new Error("Null response");
      analyticsCache.set(cacheKey, insights);
      return { status: "success", data: insights };
    } catch (error) { return { status: "error", message: "Error" }; }
  },

  // 2. RISK INTELLIGENCE 
  async getRiskInsights(data: any): Promise<any> {
    if (!data || Object.keys(data).length === 0 || (Array.isArray(data) && data.length === 0)) {
      return { status: "no_data", message: "Risk insights will activate automatically once attendance or academic data is available." };
    }
    let cacheKey = "default_risk";
    try { cacheKey = JSON.stringify(data); } catch (e) {}
    if (riskCache.has(cacheKey)) { return { status: "success", data: riskCache.get(cacheKey) }; }
    try {
      const insights = await generateRiskInsights(data);
      if (!insights) throw new Error("Null response");
      riskCache.set(cacheKey, insights);
      return { status: "success", data: insights };
    } catch (error) { return { status: "error", message: "Error" }; }
  },

  // 3. RECOMMENDATION ENGINE
  async getRecommendations(data: any): Promise<any> {
    if (!data || Object.keys(data).length === 0 || (Array.isArray(data) && data.length === 0)) {
      return { status: "no_data", message: "Recommendations will activate automatically once academic analytics data becomes available." };
    }
    let cacheKey = "default_rec";
    try { cacheKey = JSON.stringify(data); } catch (e) {}
    if (recommendationCache.has(cacheKey)) { return { status: "success", data: recommendationCache.get(cacheKey) }; }
    try {
      const insights = await generateRecommendations(data);
      if (!insights) throw new Error("Null response");
      recommendationCache.set(cacheKey, insights);
      return { status: "success", data: insights };
    } catch (error) { return { status: "error", message: "Error" }; }
  },

  // 4. COMMUNICATION INTELLIGENCE ENGINE
  async getCommunicationInsights(data: any): Promise<any> {
    if (!data || Object.keys(data).length === 0 || (Array.isArray(data) && data.length === 0)) {
      return {
        status: "no_data",
        message: "Communication insights will activate automatically once messages are recorded."
      };
    }
    let cacheKey = "default_comm";
    try { cacheKey = JSON.stringify(data); } catch (e) {
       console.warn("Could not stringify communication dataset for caching.");
    }
    if (communicationCache.has(cacheKey)) {
      console.log("[AI Controller] Communication cache hit.");
      return { status: "success", data: communicationCache.get(cacheKey) };
    }
    try {
      console.log("[AI Controller] Communication cache miss. Calling AI engine...");
      const insights = await generateCommunicationInsights(data);
      if (!insights) throw new Error("Null response from communication engine");
      communicationCache.set(cacheKey, insights);
      return { status: "success", data: insights };
    } catch (error) {
      console.error("[AI Controller] Communication processing failed:", error);
      return { status: "error", message: "Failed to generate communication insights." };
    }
  }
};
