import { describe, it, expect } from "vitest";
import { computeRecommendations } from "../ai/system/recommendations";

const sub = (name: string, avg: number, trend: "improving" | "declining" | "stable" = "stable") =>
  ({ subject: name, average_score: avg, trend });
const teacher = (name: string, avg: number, subj = "Math") =>
  ({ teacher: name, subject: subj, class_average: avg });

describe("computeRecommendations — output shape", () => {
  it("returns the three required keys as arrays", () => {
    const out = computeRecommendations({
      grade: "8",
      subject_performance: [sub("Math", 70)],
      teacher_stats: [teacher("Mr A", 70)],
      risk_students: 0,
    });
    expect(Array.isArray(out.improvement_recommendations)).toBe(true);
    expect(Array.isArray(out.teacher_effectiveness)).toBe(true);
    expect(Array.isArray(out.matched_templates)).toBe(true);
  });

  it("survives empty/undefined inputs", () => {
    const out = computeRecommendations({} as any);
    expect(out.improvement_recommendations).toEqual([]);
    expect(out.teacher_effectiveness).toEqual([]);
    // Coverage guard fires
    expect(out.matched_templates[0].type).toMatch(/School Health: Strong/);
  });
});

describe("improvement_recommendations — band-based copy", () => {
  it("flags <50% as below passing threshold", () => {
    const out = computeRecommendations({
      grade: "8",
      subject_performance: [sub("Math", 45)],
      teacher_stats: [],
      risk_students: 0,
    });
    expect(out.improvement_recommendations[0].recommendation).toMatch(/below passing threshold/i);
  });

  it("flags declining trend even at 70+", () => {
    const out = computeRecommendations({
      grade: "8",
      subject_performance: [sub("Math", 78, "declining")],
      teacher_stats: [],
      risk_students: 0,
    });
    expect(out.improvement_recommendations[0].recommendation).toMatch(/trending down/i);
  });

  it("recognises strong-improving subjects positively", () => {
    const out = computeRecommendations({
      grade: "8",
      subject_performance: [sub("Math", 90, "improving")],
      teacher_stats: [],
      risk_students: 0,
    });
    expect(out.improvement_recommendations[0].recommendation).toMatch(/Recognise|enrichment/i);
  });

  it("sorts critical (<50%) subjects first", () => {
    const out = computeRecommendations({
      grade: "8",
      subject_performance: [
        sub("English", 85),
        sub("Math", 45),
        sub("Science", 65, "declining"),
      ],
      teacher_stats: [],
      risk_students: 0,
    });
    expect(out.improvement_recommendations[0].subject).toBe("Math");
    // Then declining
    expect(out.improvement_recommendations[1].subject).toBe("Science");
  });
});

describe("teacher_effectiveness", () => {
  it("verdict matches band correctly", () => {
    const cases = [
      { avg: 90, expect: /Excellent/ },
      { avg: 75, expect: /Strong/ },
      { avg: 60, expect: /Moderate/ },
      { avg: 45, expect: /Needs support/ },
      { avg: 30, expect: /Critical/ },
    ];
    cases.forEach(({ avg, expect: re }) => {
      const out = computeRecommendations({
        grade: "8",
        subject_performance: [],
        teacher_stats: [teacher("T", avg)],
        risk_students: 0,
      });
      expect(out.teacher_effectiveness[0].evaluation).toMatch(re);
    });
  });

  it("clamps effectiveness_score to 0..100", () => {
    const out = computeRecommendations({
      grade: "8",
      subject_performance: [],
      teacher_stats: [teacher("Hi", 150), teacher("Lo", -20)],
      risk_students: 0,
    });
    const scores = out.teacher_effectiveness.map((t) => t.effectiveness_score);
    expect(scores).toEqual(expect.arrayContaining([100, 0]));
  });

  it("sorts teachers lowest first (need most support on top)", () => {
    const out = computeRecommendations({
      grade: "8",
      subject_performance: [],
      teacher_stats: [teacher("A", 80), teacher("B", 50), teacher("C", 90)],
      risk_students: 0,
    });
    expect(out.teacher_effectiveness[0].teacher).toBe("B");
  });
});

describe("matched_templates — trigger logic", () => {
  it("emits Subject Decline Alert when any subject is declining", () => {
    const out = computeRecommendations({
      grade: "8",
      subject_performance: [sub("Math", 70, "declining")],
      teacher_stats: [],
      risk_students: 0,
    });
    expect(out.matched_templates.some((t) => /Decline Alert/i.test(t.type))).toBe(true);
  });

  it("emits Below Passing Threshold when subject <50%", () => {
    const out = computeRecommendations({
      grade: "8",
      subject_performance: [sub("Math", 40)],
      teacher_stats: [],
      risk_students: 0,
    });
    expect(out.matched_templates.some((t) => /Below Passing/i.test(t.type))).toBe(true);
  });

  it("emits At-Risk Student Cluster when risk_students > 0", () => {
    const out = computeRecommendations({
      grade: "8",
      subject_performance: [sub("Math", 80)],
      teacher_stats: [],
      risk_students: 5,
    });
    expect(out.matched_templates.some((t) => /At-Risk Student Cluster/i.test(t.type))).toBe(true);
    expect(out.matched_templates.find((t) => /At-Risk/i.test(t.type))?.trigger).toMatch(/5 students/i);
  });

  it("falls back to 'School Health: Strong' when no signals fire", () => {
    const out = computeRecommendations({
      grade: "8",
      subject_performance: [sub("Math", 85)],
      teacher_stats: [teacher("Good", 85)],
      risk_students: 0,
    });
    expect(out.matched_templates[0].type).toBe("School Health: Strong");
  });
});

describe("determinism", () => {
  it("identical input → identical output", () => {
    const input = {
      grade: "10",
      subject_performance: [sub("Math", 65, "stable"), sub("English", 80, "improving")],
      teacher_stats: [teacher("A", 70), teacher("B", 90)],
      risk_students: 2,
    };
    expect(computeRecommendations(input)).toEqual(computeRecommendations(input));
  });
});
