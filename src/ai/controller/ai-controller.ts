// AI Controller — all 4 features now system-driven (no AI proxy calls).
//
// History:
//   • Earlier this controller proxied to /api/ai-insights (Vercel serverless)
//     for 5 features.
//   • 2026-05-01 first pass: getRiskInsights deleted (dead), getAcademic-
//     Analytics + getDisciplineInsights moved to system modules.
//   • 2026-05-02 second pass: per user direction, the remaining AI proxy
//     calls (Communication + Recommendations) were also converted to
//     deterministic system modules. The /api/ai-insights endpoint is no
//     longer called from this dashboard.
//
//   The only AI calls that REMAIN in principal-dashboard are:
//     • Student Intelligence  → lib/aiInsights.ts (Cloud Function)
//     • Principal Leaderboard → lib/leaderboardAI.ts (Cloud Function)
//   Both are unrelated to this controller.

import {
  computeAcademicAnalytics,
  type AcademicAnalyticsInput,
} from "../system/academic-analytics";
import {
  computeDisciplineIntelligence,
  type DisciplineInput,
} from "../system/discipline-intelligence";
import {
  computeCommunicationIntelligence,
  type CommunicationInput,
} from "../system/communication-intelligence";
import {
  computeRecommendations,
  type RecommendationsInput,
} from "../system/recommendations";

const NO_DATA_MSG = "Insights will activate automatically once relevant data is available.";
const NO_DATA_DISCIPLINE_MSG = "Discipline intelligence will activate automatically once incident logs are recorded.";

type AIResult =
  | { status: "success"; data: unknown }
  | { status: "no_data"; message: string }
  | { status: "error"; message: string };

const isEmpty = (data: unknown): boolean =>
  !data ||
  (Array.isArray(data) && data.length === 0) ||
  (typeof data === "object" && Object.keys(data as object).length === 0);

export const AIController = {
  // 1. ACADEMIC ANALYTICS — system-driven
  async getAcademicAnalytics(data: AcademicAnalyticsInput | null): Promise<AIResult> {
    if (isEmpty(data)) return { status: "no_data", message: NO_DATA_MSG };
    return { status: "success", data: computeAcademicAnalytics(data!) };
  },

  // 2. RECOMMENDATIONS — system-driven (was AI; converted 2026-05-02)
  async getRecommendations(data: RecommendationsInput | null): Promise<AIResult> {
    if (isEmpty(data)) return { status: "no_data", message: NO_DATA_MSG };
    return { status: "success", data: computeRecommendations(data!) };
  },

  // 3. COMMUNICATION INTELLIGENCE — system-driven (was AI; converted 2026-05-02)
  async getCommunicationInsights(data: CommunicationInput | null): Promise<AIResult> {
    if (isEmpty(data)) return { status: "no_data", message: NO_DATA_MSG };
    return { status: "success", data: computeCommunicationIntelligence(data!) };
  },

  // 4. DISCIPLINE INTELLIGENCE — system-driven
  async getDisciplineInsights(data: DisciplineInput | null): Promise<AIResult> {
    if (isEmpty(data)) return { status: "no_data", message: NO_DATA_DISCIPLINE_MSG };
    return { status: "success", data: computeDisciplineIntelligence(data!) };
  },
};
