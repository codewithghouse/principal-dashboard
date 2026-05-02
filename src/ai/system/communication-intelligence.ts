// Deterministic communication intelligence — replaces the AI prompt at
// ai/prompts/communication-prompt.ts (COMMUNICATION_PROMPT).
//
// Pure functions over real Firestore communication logs. Returns the same
// 4-key shape (message_classification / department_routing /
// conversation_context / broadcast_suggestions) the
// CommunicationIntelligence.tsx component renders.
//
// Why system (not AI) is enough:
//   • Category detection — keyword bags cover the 80% case (complaint,
//     concern, appreciation, inquiry); edge cases stay in "General Inquiry"
//     which is honest, not invented.
//   • Department routing — same deterministic keyword approach.
//   • Conversation context — derived from real thread participants + count.
//   • Broadcast suggestions — emerge from category clustering, not opinion.
//
// All output is deterministic: same input → same output, useMemo-cacheable.

export type Message = {
  sender?: string;
  student?: string;
  text?: string;
};

export type ConversationHistory = {
  thread_id: string;
  participants: string[];
  messages_count: number;
};

export type CommunicationInput = {
  messages: Message[];
  conversation_history: ConversationHistory[];
};

export type MessageClassification = {
  student: string;
  category: "Complaint" | "Concern" | "Appreciation" | "Information Request" | "General Inquiry";
  summary: string;
};

export type DepartmentRouting = {
  message: string;
  route_to: "Academic" | "Attendance" | "Discipline" | "Administration";
};

export type ConversationContext = {
  thread_id: string;
  context_summary: string;
};

export type BroadcastSuggestion = {
  target_group: string;
  reason: string;
};

export type CommunicationOutput = {
  message_classification: MessageClassification[];
  department_routing: DepartmentRouting[];
  conversation_context: ConversationContext[];
  broadcast_suggestions: BroadcastSuggestion[];
};

// ── Keyword bags — derived from common parent-school message patterns.
// Word-boundary regex keeps "warn" inside "warning" from triggering "war".
const COMPLAINT_WORDS = [
  "complaint", "complain", "unacceptable", "disappointed",
  "poor", "bad", "worst", "issue", "problem", "wrong",
  "unfair", "biased", "rude", "shocked", "horrible",
];
const CONCERN_WORDS = [
  "concern", "concerned", "worried", "worry", "anxious",
  "struggling", "behind", "fall behind", "not improving",
  "stress", "stressed", "fear", "scared", "trouble",
];
const APPRECIATION_WORDS = [
  "thank", "thanks", "thankful", "grateful", "appreciate",
  "appreciated", "wonderful", "excellent", "great", "amazing",
  "fantastic", "kudos", "well done", "praise",
];
const INQUIRY_WORDS = [
  "could you", "can you", "please share", "please send",
  "request", "kindly", "may i know", "can i get",
  "would like to know", "let me know",
];

const ACADEMIC_WORDS = [
  "homework", "assignment", "test", "exam", "score", "marks",
  "subject", "math", "science", "english", "lesson", "study",
  "syllabus", "chapter", "result", "grade",
];
const ATTENDANCE_WORDS = [
  "absent", "leave", "sick", "fever", "ill", "missing class",
  "late", "permission", "holiday", "attendance",
];
const DISCIPLINE_WORDS = [
  "behaviour", "behavior", "fight", "fighting", "fought",
  "bully", "bullied", "bullying", "rude", "talking",
  "punishment", "punished", "scolded", "incident", "misbehav",
  "misbehave", "misbehaved", "misbehaving",
];

const wordHit = (text: string, words: string[]): boolean => {
  const t = text.toLowerCase();
  return words.some((w) => new RegExp(`\\b${w.replace(/\s+/g, "\\s+")}\\b`).test(t));
};

const classifyMessage = (text: string): MessageClassification["category"] => {
  // Order matters — complaints (most urgent for principal) first.
  if (wordHit(text, COMPLAINT_WORDS)) return "Complaint";
  if (wordHit(text, CONCERN_WORDS)) return "Concern";
  if (wordHit(text, APPRECIATION_WORDS)) return "Appreciation";
  if (wordHit(text, INQUIRY_WORDS)) return "Information Request";
  return "General Inquiry";
};

const routeMessage = (text: string): DepartmentRouting["route_to"] => {
  // Discipline first — usually the most urgent and most specific keywords.
  if (wordHit(text, DISCIPLINE_WORDS)) return "Discipline";
  if (wordHit(text, ATTENDANCE_WORDS)) return "Attendance";
  if (wordHit(text, ACADEMIC_WORDS)) return "Academic";
  return "Administration";
};

const summariseMessage = (text: string, category: MessageClassification["category"]): string => {
  // 1-line summary derived from category + a short snippet of the message
  // (truncated, never invented). Keeps the principal's quick scan honest:
  // they always see the actual phrase, not an AI rephrase.
  const snippet = text.length > 80 ? `${text.slice(0, 78).trim()}…` : text.trim();
  switch (category) {
    case "Complaint":           return `Parent complaint flagged. Quote: "${snippet}"`;
    case "Concern":             return `Parent expressed concern. Quote: "${snippet}"`;
    case "Appreciation":        return `Positive feedback received. Quote: "${snippet}"`;
    case "Information Request": return `Information request from parent. Quote: "${snippet}"`;
    case "General Inquiry":     return `General inquiry. Quote: "${snippet}"`;
  }
};

const MAX_CLASSIFICATIONS = 12;
const MAX_ROUTING = 12;
const MAX_CONTEXTS = 8;
const MAX_BROADCASTS = 4;

const buildClassifications = (messages: Message[]): MessageClassification[] => {
  return messages
    .filter((m) => (m.text || "").trim().length > 0)
    .slice(0, MAX_CLASSIFICATIONS)
    .map((m) => {
      const text = (m.text || "").trim();
      const category = classifyMessage(text);
      return {
        student: (m.student || "Unknown").trim() || "Unknown",
        category,
        summary: summariseMessage(text, category),
      };
    });
};

const buildRouting = (messages: Message[]): DepartmentRouting[] => {
  return messages
    .filter((m) => (m.text || "").trim().length > 0)
    .slice(0, MAX_ROUTING)
    .map((m) => {
      const text = (m.text || "").trim();
      const snippet = text.length > 60 ? `${text.slice(0, 58).trim()}…` : text;
      return { message: snippet, route_to: routeMessage(text) };
    });
};

const buildContexts = (history: ConversationHistory[]): ConversationContext[] => {
  return history
    .filter((h) => h.messages_count > 0)
    .slice(0, MAX_CONTEXTS)
    .map((h) => {
      const participantList = h.participants.length > 0
        ? h.participants.slice(0, 3).join(", ") + (h.participants.length > 3 ? ` +${h.participants.length - 3}` : "")
        : "no recorded participants";
      const intensity = h.messages_count >= 6 ? "active" : h.messages_count >= 3 ? "ongoing" : "brief";
      return {
        thread_id: String(h.thread_id),
        context_summary: `${intensity.charAt(0).toUpperCase() + intensity.slice(1)} thread — ${h.messages_count} message${h.messages_count > 1 ? "s" : ""} between ${participantList}.`,
      };
    });
};

const buildBroadcasts = (
  classifications: MessageClassification[],
  routing: DepartmentRouting[],
): BroadcastSuggestion[] => {
  const out: BroadcastSuggestion[] = [];

  // Cluster of complaints → school-wide policy clarification needed
  const complaintCount = classifications.filter((c) => c.category === "Complaint").length;
  if (complaintCount >= 3) {
    out.push({
      target_group: "All parents",
      reason: `${complaintCount} complaints received in this window — a school-wide policy clarification or apology message would defuse the situation.`,
    });
  }

  // Cluster of attendance routing → notify with attendance reminder
  const attCount = routing.filter((r) => r.route_to === "Attendance").length;
  if (attCount >= 4) {
    out.push({
      target_group: "Parents of frequently absent students",
      reason: `${attCount} attendance-related messages — a reminder broadcast about attendance policy and the impact on academics would prevent further enquiries.`,
    });
  }

  // Cluster of discipline routing → behavioural-expectation note
  const discCount = routing.filter((r) => r.route_to === "Discipline").length;
  if (discCount >= 3) {
    out.push({
      target_group: "All parents",
      reason: `${discCount} discipline-related messages — sending the school's behavioural-expectations note would reset the conversation.`,
    });
  }

  // Cluster of appreciation → positive-recognition broadcast
  const appCount = classifications.filter((c) => c.category === "Appreciation").length;
  if (appCount >= 4) {
    out.push({
      target_group: "All teachers",
      reason: `${appCount} appreciation messages from parents — share these with teachers in the next staff briefing to reinforce positive culture.`,
    });
  }

  return out.slice(0, MAX_BROADCASTS);
};

export function computeCommunicationIntelligence(
  input: CommunicationInput,
): CommunicationOutput {
  const messages = Array.isArray(input?.messages) ? input.messages : [];
  const history = Array.isArray(input?.conversation_history) ? input.conversation_history : [];

  const classifications = buildClassifications(messages);
  const routing = buildRouting(messages);
  const contexts = buildContexts(history);
  const broadcasts = buildBroadcasts(classifications, routing);

  return {
    message_classification: classifications,
    department_routing: routing,
    conversation_context: contexts,
    broadcast_suggestions: broadcasts,
  };
}
