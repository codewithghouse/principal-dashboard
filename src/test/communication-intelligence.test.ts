import { describe, it, expect } from "vitest";
import { computeCommunicationIntelligence } from "../ai/system/communication-intelligence";

const msg = (text: string, student = "Aditya") => ({ student, sender: "Parent", text });

describe("computeCommunicationIntelligence — output shape", () => {
  it("returns the four required keys as arrays", () => {
    const out = computeCommunicationIntelligence({ messages: [msg("hi")], conversation_history: [] });
    expect(Array.isArray(out.message_classification)).toBe(true);
    expect(Array.isArray(out.department_routing)).toBe(true);
    expect(Array.isArray(out.conversation_context)).toBe(true);
    expect(Array.isArray(out.broadcast_suggestions)).toBe(true);
  });

  it("handles empty input gracefully", () => {
    const out = computeCommunicationIntelligence({ messages: [], conversation_history: [] });
    expect(out.message_classification).toEqual([]);
    expect(out.department_routing).toEqual([]);
    expect(out.conversation_context).toEqual([]);
    expect(out.broadcast_suggestions).toEqual([]);
  });

  it("does not crash on undefined inputs", () => {
    const out = computeCommunicationIntelligence({} as any);
    expect(out.message_classification).toEqual([]);
  });
});

describe("message classification — keyword detection", () => {
  it("detects Complaint", () => {
    const out = computeCommunicationIntelligence({
      messages: [msg("This is unacceptable, my daughter was treated rudely")],
      conversation_history: [],
    });
    expect(out.message_classification[0].category).toBe("Complaint");
  });

  it("detects Concern", () => {
    const out = computeCommunicationIntelligence({
      messages: [msg("I am concerned about my son's grades, he is struggling")],
      conversation_history: [],
    });
    expect(out.message_classification[0].category).toBe("Concern");
  });

  it("detects Appreciation", () => {
    const out = computeCommunicationIntelligence({
      messages: [msg("Thank you so much, the teacher has been wonderful")],
      conversation_history: [],
    });
    expect(out.message_classification[0].category).toBe("Appreciation");
  });

  it("detects Information Request", () => {
    const out = computeCommunicationIntelligence({
      messages: [msg("Could you share the exam schedule please")],
      conversation_history: [],
    });
    expect(out.message_classification[0].category).toBe("Information Request");
  });

  it("falls back to General Inquiry when no keyword matches", () => {
    const out = computeCommunicationIntelligence({
      messages: [msg("Hello")],
      conversation_history: [],
    });
    expect(out.message_classification[0].category).toBe("General Inquiry");
  });

  it("Complaint takes priority over other categories", () => {
    // Message has both complaint AND appreciation words — complaint wins
    const out = computeCommunicationIntelligence({
      messages: [msg("Thanks but this complaint needs immediate attention")],
      conversation_history: [],
    });
    expect(out.message_classification[0].category).toBe("Complaint");
  });

  it("includes the actual message snippet in the summary (no AI rephrasing)", () => {
    const text = "My child is struggling with science homework";
    const out = computeCommunicationIntelligence({
      messages: [msg(text)],
      conversation_history: [],
    });
    expect(out.message_classification[0].summary).toContain("struggling");
  });

  it("uses 'Unknown' when student name is missing", () => {
    const out = computeCommunicationIntelligence({
      messages: [{ text: "hi", sender: "Parent" }],
      conversation_history: [],
    });
    expect(out.message_classification[0].student).toBe("Unknown");
  });
});

describe("department routing", () => {
  it("routes discipline keywords to Discipline (highest priority)", () => {
    const out = computeCommunicationIntelligence({
      messages: [msg("My son was bullied today during the math class")],
      conversation_history: [],
    });
    // Discipline beats Academic even though both keywords present
    expect(out.department_routing[0].route_to).toBe("Discipline");
  });

  it("routes attendance keywords to Attendance", () => {
    const out = computeCommunicationIntelligence({
      messages: [msg("She will be absent tomorrow due to fever")],
      conversation_history: [],
    });
    expect(out.department_routing[0].route_to).toBe("Attendance");
  });

  it("routes academic keywords to Academic", () => {
    const out = computeCommunicationIntelligence({
      messages: [msg("Please send the syllabus for next month")],
      conversation_history: [],
    });
    expect(out.department_routing[0].route_to).toBe("Academic");
  });

  it("falls through to Administration", () => {
    const out = computeCommunicationIntelligence({
      messages: [msg("Hi")],
      conversation_history: [],
    });
    expect(out.department_routing[0].route_to).toBe("Administration");
  });
});

describe("conversation_context", () => {
  it("labels intensity by message count", () => {
    const out = computeCommunicationIntelligence({
      messages: [],
      conversation_history: [
        { thread_id: "T1", participants: ["Parent", "Teacher"], messages_count: 1 },
        { thread_id: "T2", participants: ["Parent", "Teacher"], messages_count: 4 },
        { thread_id: "T3", participants: ["Parent", "Teacher"], messages_count: 8 },
      ],
    });
    expect(out.conversation_context[0].context_summary).toMatch(/Brief/);
    expect(out.conversation_context[1].context_summary).toMatch(/Ongoing/);
    expect(out.conversation_context[2].context_summary).toMatch(/Active/);
  });

  it("trims participant list to 3 with +N suffix", () => {
    const out = computeCommunicationIntelligence({
      messages: [],
      conversation_history: [
        { thread_id: "T1", participants: ["A", "B", "C", "D", "E"], messages_count: 5 },
      ],
    });
    expect(out.conversation_context[0].context_summary).toMatch(/A, B, C \+2/);
  });
});

describe("broadcast_suggestions", () => {
  it("triggers school-wide complaint clarification when 3+ complaints", () => {
    const out = computeCommunicationIntelligence({
      messages: Array.from({ length: 3 }, () => msg("This is a complaint, very poor")),
      conversation_history: [],
    });
    expect(out.broadcast_suggestions.some((b) => /complaint/i.test(b.reason))).toBe(true);
  });

  it("triggers attendance broadcast when 4+ attendance routings", () => {
    const out = computeCommunicationIntelligence({
      messages: Array.from({ length: 4 }, () => msg("She will be absent")),
      conversation_history: [],
    });
    expect(out.broadcast_suggestions.some((b) => /attendance/i.test(b.reason))).toBe(true);
  });

  it("triggers staff briefing on appreciation cluster (4+)", () => {
    const out = computeCommunicationIntelligence({
      messages: Array.from({ length: 4 }, () => msg("Thanks so much, wonderful work")),
      conversation_history: [],
    });
    expect(out.broadcast_suggestions.some((b) => /staff briefing/i.test(b.reason))).toBe(true);
  });

  it("does not trigger broadcasts under threshold", () => {
    const out = computeCommunicationIntelligence({
      messages: [msg("complaint")],
      conversation_history: [],
    });
    expect(out.broadcast_suggestions).toEqual([]);
  });
});

describe("determinism", () => {
  it("identical input → identical output", () => {
    const input = {
      messages: [msg("complaint about teacher"), msg("absent tomorrow", "B")],
      conversation_history: [{ thread_id: "T1", participants: ["P"], messages_count: 3 }],
    };
    expect(computeCommunicationIntelligence(input)).toEqual(computeCommunicationIntelligence(input));
  });
});
