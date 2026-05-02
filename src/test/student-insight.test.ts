import { describe, it, expect } from "vitest";
import { computeStudentInsight } from "../ai/system/student-insight";
import { classifyStudent, type StudentSignals } from "../lib/classifyStudent";

const make = (overrides: Partial<StudentSignals> = {}) =>
  classifyStudent({
    studentId: "s1",
    studentName: "Aditya",
    className: "10A",
    rollNo: "12",
    totalAttendance: 100,
    presentAttendance: 90,
    scores: [70, 72, 75, 73, 78],
    ...overrides,
  });

describe("computeStudentInsight — output shape", () => {
  it("returns all 7 required keys with correct types", () => {
    const out = computeStudentInsight(make());
    expect(Array.isArray(out.rootCauses)).toBe(true);
    expect(Array.isArray(out.forTeacher)).toBe(true);
    expect(Array.isArray(out.forParent)).toBe(true);
    expect(out.nextSteps).toHaveProperty("immediate");
    expect(out.nextSteps).toHaveProperty("shortTerm");
    expect(out.nextSteps).toHaveProperty("longTerm");
    expect(["critical", "high", "medium", "low"]).toContain(out.urgency);
    expect(["high", "medium", "low"]).toContain(out.confidence);
    expect(typeof out.summary).toBe("string");
    expect(out.summary.length).toBeGreaterThan(20);
  });

  it("respects array length caps", () => {
    const out = computeStudentInsight(make());
    expect(out.rootCauses.length).toBeLessThanOrEqual(5);
    expect(out.forTeacher.length).toBeLessThanOrEqual(5);
    expect(out.forParent.length).toBeLessThanOrEqual(4);
  });
});

describe("urgency ladder", () => {
  it("CRITICAL when score AND attendance are critical", () => {
    const out = computeStudentInsight(make({
      scores: [25, 28, 22],
      totalAttendance: 100, presentAttendance: 50,
    }));
    expect(out.urgency).toBe("critical");
  });

  it("HIGH when only one of score/attendance is critical", () => {
    const onlyScore = computeStudentInsight(make({
      scores: [20, 25, 28],
      totalAttendance: 100, presentAttendance: 95,
    }));
    expect(onlyScore.urgency).toBe("high");

    const onlyAtt = computeStudentInsight(make({
      scores: [80, 82, 85],
      totalAttendance: 100, presentAttendance: 50,
    }));
    expect(onlyAtt.urgency).toBe("high");
  });

  it("HIGH when weak band + declining trend", () => {
    const out = computeStudentInsight(make({
      scores: [60, 55, 50, 45, 42], // weak + declining
    }));
    expect(out.urgency).toBe("high");
  });

  it("MEDIUM for weak category alone", () => {
    const out = computeStudentInsight(make({
      scores: [55, 56, 54], // weak band but stable
      totalAttendance: 100, presentAttendance: 80,
    }));
    expect(["medium", "high"]).toContain(out.urgency);
  });

  it("LOW for strong + stable students", () => {
    const out = computeStudentInsight(make({
      scores: [85, 88, 90, 87],
      totalAttendance: 100, presentAttendance: 95,
    }));
    expect(out.urgency).toBe("low");
  });
});

describe("confidence ladder", () => {
  it("LOW when no data", () => {
    const out = computeStudentInsight(make({
      scores: [],
      totalAttendance: 0, presentAttendance: 0,
    }));
    expect(out.confidence).toBe("low");
  });

  it("LOW with <3 tests", () => {
    const out = computeStudentInsight(make({ scores: [70, 72] }));
    expect(out.confidence).toBe("low");
  });

  it("MEDIUM with 3-4 tests", () => {
    const out = computeStudentInsight(make({ scores: [70, 72, 75] }));
    expect(out.confidence).toBe("medium");
  });

  it("HIGH with 5+ tests AND attendance data", () => {
    const out = computeStudentInsight(make({ scores: [70, 72, 75, 73, 78] }));
    expect(out.confidence).toBe("high");
  });
});

describe("rootCauses — signal-driven content", () => {
  it("calls out 'no data yet' honestly when no scores AND no attendance", () => {
    const out = computeStudentInsight(make({
      scores: [], totalAttendance: 0, presentAttendance: 0,
    }));
    expect(out.rootCauses[0]).toMatch(/No tests or attendance recorded/i);
  });

  it("flags critical score with foundational gap framing", () => {
    const out = computeStudentInsight(make({ scores: [25, 28, 22] }));
    expect(out.rootCauses.some(c => /foundational concept gaps/i.test(c))).toBe(true);
  });

  it("flags declining trend with concrete % drop", () => {
    const out = computeStudentInsight(make({
      scores: [80, 78, 75, 60, 55, 50],
    }));
    expect(out.rootCauses.some(c => /trend has dropped/i.test(c))).toBe(true);
  });

  it("flags improving trend positively (no false alarm)", () => {
    const out = computeStudentInsight(make({
      scores: [50, 55, 60, 70, 75, 80],
    }));
    expect(out.rootCauses.some(c => /trending upward/i.test(c))).toBe(true);
  });

  it("flags critical attendance specifically", () => {
    const out = computeStudentInsight(make({
      scores: [70, 72, 75],
      totalAttendance: 100, presentAttendance: 50,
    }));
    expect(out.rootCauses.some(c => /Attendance at 50% is severely low/i.test(c))).toBe(true);
  });

  it("uses 'no negative signals' for smart-band students", () => {
    const out = computeStudentInsight(make({
      scores: [85, 88, 90, 87],
      totalAttendance: 100, presentAttendance: 95,
    }));
    expect(out.rootCauses[0]).toMatch(/no negative signals/i);
  });
});

describe("forTeacher — actionable + name-personalised", () => {
  it("includes student name in actions", () => {
    const out = computeStudentInsight(make({ studentName: "Aditya" }));
    expect(out.forTeacher.some(a => a.includes("Aditya"))).toBe(true);
  });

  it("recommends one-on-one diagnostic for critical scores", () => {
    const out = computeStudentInsight(make({ scores: [25, 28, 22] }));
    expect(out.forTeacher.some(a => /one-on-one diagnostic/i.test(a))).toBe(true);
  });

  it("recommends parent loop when attendance is concerning/critical", () => {
    const out = computeStudentInsight(make({
      scores: [70, 72, 75],
      totalAttendance: 100, presentAttendance: 55,
    }));
    expect(out.forTeacher.some(a => /Loop in the parent/i.test(a))).toBe(true);
  });

  it("recommends stretch problems for smart students", () => {
    const out = computeStudentInsight(make({
      scores: [85, 88, 90, 87],
      totalAttendance: 100, presentAttendance: 95,
    }));
    expect(out.forTeacher.some(a => /stretch problems|peer-mentoring/i.test(a))).toBe(true);
  });
});

describe("forParent — at-home actions", () => {
  it("uses student name", () => {
    const out = computeStudentInsight(make({ studentName: "Aditya" }));
    expect(out.forParent.some(a => a.includes("Aditya"))).toBe(true);
  });

  it("includes the universal sleep tip for any band with data", () => {
    const out = computeStudentInsight(make({ scores: [70, 72, 75] }));
    expect(out.forParent.some(a => /8.{1,3}9 hours of sleep/i.test(a))).toBe(true);
  });

  it("suggests review session for weak/critical bands", () => {
    const out = computeStudentInsight(make({ scores: [40, 42, 45] }));
    expect(out.forParent.some(a => /sit with .* review|weak topics/i.test(a))).toBe(true);
  });

  it("falls back to no-data guidance gracefully", () => {
    const out = computeStudentInsight(make({
      scores: [], totalAttendance: 0, presentAttendance: 0,
    }));
    expect(out.forParent[0]).toMatch(/Once school records/i);
  });
});

describe("nextSteps — time horizons", () => {
  it("returns three time-bound steps", () => {
    const out = computeStudentInsight(make());
    expect(out.nextSteps.immediate.length).toBeGreaterThan(20);
    expect(out.nextSteps.shortTerm.length).toBeGreaterThan(20);
    expect(out.nextSteps.longTerm.length).toBeGreaterThan(20);
  });

  it("immediate: parent meeting for critical+critical case", () => {
    const out = computeStudentInsight(make({
      scores: [25, 28, 22],
      totalAttendance: 100, presentAttendance: 50,
    }));
    expect(out.nextSteps.immediate).toMatch(/parent meeting/i);
  });

  it("immediate: recognition for smart students", () => {
    const out = computeStudentInsight(make({
      scores: [85, 88, 90, 87],
      totalAttendance: 100, presentAttendance: 95,
    }));
    expect(out.nextSteps.immediate).toMatch(/Recognise/i);
  });

  it("longTerm: target lift goal for critical scores", () => {
    const out = computeStudentInsight(make({ scores: [25, 28, 22] }));
    expect(out.nextSteps.longTerm).toMatch(/above 50%|every assessment/i);
  });

  it("longTerm: enrichment programme for smart students", () => {
    const out = computeStudentInsight(make({
      scores: [85, 88, 90, 87],
      totalAttendance: 100, presentAttendance: 95,
    }));
    expect(out.nextSteps.longTerm).toMatch(/enrichment|olympiad/i);
  });
});

describe("summary — composed sentence", () => {
  it("includes student name + category + average + test count", () => {
    const out = computeStudentInsight(make({ studentName: "Aditya" }));
    expect(out.summary).toMatch(/Aditya/);
    expect(out.summary).toMatch(/\d+%/);
  });

  it("calls out declining trend with % drop", () => {
    const out = computeStudentInsight(make({
      scores: [80, 78, 75, 60, 55, 50],
    }));
    expect(out.summary).toMatch(/dropped/i);
  });

  it("uses honest no-data copy when student has no scores/attendance", () => {
    const out = computeStudentInsight(make({
      scores: [], totalAttendance: 0, presentAttendance: 0,
    }));
    expect(out.summary).toMatch(/insufficient data/i);
  });
});

describe("determinism", () => {
  it("identical input → identical output", () => {
    const a = computeStudentInsight(make());
    const b = computeStudentInsight(make());
    expect(a).toEqual(b);
  });
});

describe("defensive parsing", () => {
  it("ignores NaN scores", () => {
    const out = computeStudentInsight(make({ scores: [70, NaN, 75, 73, 78] }));
    expect(out.confidence).toBeDefined();
    expect(out.summary).toMatch(/\d+%/);
  });

  it("handles missing student name (uses 'this student' / 'your child')", () => {
    const out = computeStudentInsight(make({ studentName: "" }));
    expect(out.rootCauses.join(" ")).toMatch(/this student|your child/i);
  });
});
