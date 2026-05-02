import { describe, it, expect } from "vitest";
import { computeAcademicAnalytics } from "../ai/system/academic-analytics";

const baseInput = (overrides: Partial<Parameters<typeof computeAcademicAnalytics>[0]> = {}) => ({
  total_records: 100,
  average_performance: "75",
  subjects: [
    { name: "Math",    average_score: 78, pass_rate: 85 },
    { name: "Science", average_score: 72, pass_rate: 80 },
    { name: "English", average_score: 80, pass_rate: 90 },
  ],
  monthly_average: [70, 72, 74, 76, 78],
  ...overrides,
});

describe("computeAcademicAnalytics — output shape", () => {
  it("returns the four required keys", () => {
    const out = computeAcademicAnalytics(baseInput());
    expect(out).toHaveProperty("performance_trend");
    expect(out).toHaveProperty("distribution_summary");
    expect(out).toHaveProperty("monthly_trend");
    expect(out).toHaveProperty("historical_comparison");
    Object.values(out).forEach((v) => {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(10);
    });
  });

  it("handles zero records honestly (no fake numbers)", () => {
    const out = computeAcademicAnalytics(baseInput({ total_records: 0, monthly_average: [] }));
    expect(out.performance_trend).toMatch(/No academic records/i);
    expect(out.distribution_summary).toMatch(/once results are recorded/i);
    expect(out.monthly_trend).toMatch(/once enough months/i);
  });
});

describe("computeAcademicAnalytics — performance bands", () => {
  it(">=80 → outstanding", () => {
    const out = computeAcademicAnalytics(baseInput({ average_performance: 85 }));
    expect(out.performance_trend).toMatch(/outstanding/i);
  });
  it("70-79 → strong", () => {
    const out = computeAcademicAnalytics(baseInput({ average_performance: 75 }));
    expect(out.performance_trend).toMatch(/strong/i);
  });
  it("60-69 → stable", () => {
    const out = computeAcademicAnalytics(baseInput({ average_performance: 65 }));
    expect(out.performance_trend).toMatch(/stable/i);
  });
  it("<60 → needs work", () => {
    const out = computeAcademicAnalytics(baseInput({ average_performance: 50 }));
    expect(out.performance_trend).toMatch(/below comfort/i);
  });
});

describe("computeAcademicAnalytics — weak subjects", () => {
  it("flags subjects with average <60%", () => {
    const out = computeAcademicAnalytics(baseInput({
      subjects: [
        { name: "Math",    average_score: 55, pass_rate: 50 },
        { name: "Hindi",   average_score: 45, pass_rate: 40 },
        { name: "English", average_score: 80, pass_rate: 90 },
      ],
    }));
    expect(out.performance_trend).toMatch(/Math, Hindi/);
  });

  it("does not invent a weak-subject mention when none exist", () => {
    const out = computeAcademicAnalytics(baseInput());
    expect(out.performance_trend).not.toMatch(/below 60%/i);
  });
});

describe("computeAcademicAnalytics — monthly trend", () => {
  it("calls out improvement when last month rose by >1.5%", () => {
    const out = computeAcademicAnalytics(baseInput({ monthly_average: [70, 72, 74, 76, 80] }));
    expect(out.monthly_trend).toMatch(/improving/i);
  });
  it("calls out decline when last month dropped by >1.5%", () => {
    const out = computeAcademicAnalytics(baseInput({ monthly_average: [80, 78, 76, 74, 70] }));
    expect(out.monthly_trend).toMatch(/declining/i);
  });
  it("calls trend stable when last delta is <=1.5%", () => {
    const out = computeAcademicAnalytics(baseInput({ monthly_average: [75, 75.5, 76, 76.5, 77] }));
    expect(out.monthly_trend).toMatch(/stable/i);
  });
  it("handles single-month data without crashing", () => {
    const out = computeAcademicAnalytics(baseInput({ monthly_average: [75] }));
    expect(out.monthly_trend).toMatch(/Only one month/i);
  });
});

describe("computeAcademicAnalytics — historical comparison", () => {
  it("says 'will activate' when prior_term_average is missing", () => {
    const out = computeAcademicAnalytics(baseInput());
    expect(out.historical_comparison).toMatch(/will activate after one full term/i);
  });
  it("flags improvement vs prior term", () => {
    const out = computeAcademicAnalytics(baseInput({
      average_performance: 80,
      prior_term_average: 70,
    }));
    expect(out.historical_comparison).toMatch(/Improvement vs prior term/i);
    expect(out.historical_comparison).toMatch(/10/); // delta
  });
  it("flags decline vs prior term", () => {
    const out = computeAcademicAnalytics(baseInput({
      average_performance: 65,
      prior_term_average: 75,
    }));
    expect(out.historical_comparison).toMatch(/Decline vs prior term/i);
  });
  it("notes 'holding steady' for delta <1%", () => {
    const out = computeAcademicAnalytics(baseInput({
      average_performance: 75.4,
      prior_term_average: 75.0,
    }));
    expect(out.historical_comparison).toMatch(/Holding steady/i);
  });
});

describe("computeAcademicAnalytics — determinism + defensive parsing", () => {
  it("identical input → identical output", () => {
    const a = computeAcademicAnalytics(baseInput());
    const b = computeAcademicAnalytics(baseInput());
    expect(a).toEqual(b);
  });
  it("parses average_performance as string safely", () => {
    // Use a decimal that rounds unambiguously — 78.42 → "78.4" via toFixed(1).
    const out = computeAcademicAnalytics(baseInput({ average_performance: "78.42" }));
    expect(out.performance_trend).toMatch(/78\.4/);
  });
  it("treats invalid average as 0 → 'below comfort'", () => {
    const out = computeAcademicAnalytics(baseInput({ average_performance: "nope" as any }));
    expect(out.performance_trend).toMatch(/below comfort/i);
  });
  it("handles missing arrays gracefully", () => {
    const out = computeAcademicAnalytics({
      total_records: 0,
      average_performance: 0,
      subjects: undefined as any,
      monthly_average: undefined as any,
    });
    expect(out.performance_trend).toMatch(/No academic records/i);
  });
});
