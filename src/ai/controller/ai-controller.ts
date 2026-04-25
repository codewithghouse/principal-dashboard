// AI Controller — server-proxied OpenAI calls only.
//
// Every method routes through /api/ai-insights (Vercel serverless), which:
//   • verifies the caller's Firebase ID token
//   • enforces role: principal | owner
//   • rate-limits to 10 calls/min/user
//   • caps instructions at 4k chars and data at 40k chars
//   • holds OPENAI_API_KEY server-side (never bundled into JS)
//
// The earlier engines/* files that called OpenAI directly from the browser
// have been deleted — that path baked the API key into the production bundle.
import { auth } from "@/lib/firebase";
import { ACADEMIC_ANALYTICS_PROMPT } from "../prompts/analytics-prompt";
import { RISK_INSIGHTS_PROMPT } from "../prompts/risk-prompt";
import { RECOMMENDATION_PROMPT } from "../prompts/recommendation-prompt";
import { COMMUNICATION_PROMPT } from "../prompts/communication-prompt";
import { DISCIPLINE_PROMPT } from "../prompts/discipline-prompt";

const NO_DATA_MSG = "AI insights will activate automatically once relevant data is available.";
const NO_DATA_DISCIPLINE_MSG = "Discipline intelligence will activate automatically once incident logs are recorded.";
const ERROR_MSG = "AI service temporarily unavailable";

type AIResult =
  | { status: "success"; data: unknown }
  | { status: "no_data"; message: string }
  | { status: "error"; message: string };

// ── Per-feature memory caches (process-lifetime, dedupes redundant calls) ────
const analyticsCache = new Map<string, unknown>();
const riskCache = new Map<string, unknown>();
const recommendationCache = new Map<string, unknown>();
const communicationCache = new Map<string, unknown>();
const disciplineCache = new Map<string, unknown>();

const isEmpty = (data: unknown): boolean =>
  !data ||
  (Array.isArray(data) && data.length === 0) ||
  (typeof data === "object" && Object.keys(data as object).length === 0);

// ── Single proxy call helper. Same shape as /api/ai-insights expects. ───────
async function callAIProxy(data: unknown, instructions: string): Promise<unknown> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Not authenticated");

  const response = await fetch("/api/ai-insights", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data, instructions }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({} as { error?: string }));
    throw new Error(err.error || `AI Proxy Error: ${response.status}`);
  }

  return response.json();
}

// ── Generic success/cache wrapper used by every public method ────────────────
async function runFeature(
  data: unknown,
  cache: Map<string, unknown>,
  instructions: string,
  noDataMsg: string,
  logLabel: string,
): Promise<AIResult> {
  if (isEmpty(data)) return { status: "no_data", message: noDataMsg };

  const cacheKey = JSON.stringify(data);
  const cached = cache.get(cacheKey);
  if (cached) return { status: "success", data: cached };

  try {
    const insights = await callAIProxy(data, instructions);
    if (!insights) throw new Error("Null response");
    cache.set(cacheKey, insights);
    return { status: "success", data: insights };
  } catch (error) {
    console.error(`[AI Controller] ${logLabel} error:`, error);
    return { status: "error", message: ERROR_MSG };
  }
}

export const AIController = {
  // 1. ACADEMIC ANALYTICS
  getAcademicAnalytics(data: unknown): Promise<AIResult> {
    return runFeature(data, analyticsCache, ACADEMIC_ANALYTICS_PROMPT, NO_DATA_MSG, "Academic analytics");
  },

  // 2. RISK INTELLIGENCE
  getRiskInsights(data: unknown): Promise<AIResult> {
    return runFeature(data, riskCache, RISK_INSIGHTS_PROMPT, NO_DATA_MSG, "Risk");
  },

  // 3. RECOMMENDATION ENGINE
  getRecommendations(data: unknown): Promise<AIResult> {
    return runFeature(data, recommendationCache, RECOMMENDATION_PROMPT, NO_DATA_MSG, "Recommendation");
  },

  // 4. COMMUNICATION INTELLIGENCE
  getCommunicationInsights(data: unknown): Promise<AIResult> {
    return runFeature(data, communicationCache, COMMUNICATION_PROMPT, NO_DATA_MSG, "Communication");
  },

  // 5. DISCIPLINE INTELLIGENCE
  getDisciplineInsights(data: unknown): Promise<AIResult> {
    return runFeature(data, disciplineCache, DISCIPLINE_PROMPT, NO_DATA_DISCIPLINE_MSG, "Discipline");
  },
};
