import { describe, it, expect } from "vitest";
import { computeDisciplineIntelligence } from "../ai/system/discipline-intelligence";

const log = (overrides: any = {}) => ({
  student: "Aditya",
  type: "Late submission",
  severity: "Medium",
  date: "2026-04-01",
  location: "Class 10A",
  ...overrides,
});

describe("computeDisciplineIntelligence — output shape", () => {
  it("returns the three required keys as arrays", () => {
    const out = computeDisciplineIntelligence({ logs: [log()] });
    expect(Array.isArray(out.behavioral_patterns)).toBe(true);
    expect(Array.isArray(out.related_incidents)).toBe(true);
    expect(Array.isArray(out.intervention_suggestions)).toBe(true);
  });

  it("handles empty input without crashing", () => {
    const out = computeDisciplineIntelligence({ logs: [] });
    expect(out.behavioral_patterns).toEqual([]);
    expect(out.related_incidents).toEqual([]);
    expect(out.intervention_suggestions[0]?.action).toMatch(/No repeat patterns/i);
  });
});

describe("behavioral_patterns — repeat-offender threshold", () => {
  it("does NOT surface students with <3 incidents (no false flagging)", () => {
    const out = computeDisciplineIntelligence({
      logs: [log(), log({ date: "2026-04-02" })],
    });
    expect(out.behavioral_patterns).toHaveLength(0);
  });

  it("surfaces students with >=3 incidents", () => {
    const out = computeDisciplineIntelligence({
      logs: [log(), log({ date: "2026-04-02" }), log({ date: "2026-04-03" })],
    });
    expect(out.behavioral_patterns).toHaveLength(1);
    expect(out.behavioral_patterns[0].student).toBe("Aditya");
    expect(out.behavioral_patterns[0].pattern_detected).toMatch(/3 incidents/);
  });

  it("ranks Critical severity first", () => {
    const logs = [
      ...Array.from({ length: 3 }, (_, i) => log({ student: "Bob",   date: `2026-04-0${i+1}`, severity: "Medium" })),
      ...Array.from({ length: 3 }, (_, i) => log({ student: "Alice", date: `2026-04-0${i+1}`, severity: "Critical" })),
    ];
    const out = computeDisciplineIntelligence({ logs });
    expect(out.behavioral_patterns[0].student).toBe("Alice");
    expect(out.behavioral_patterns[0].severity).toBe("Critical");
  });

  it("skips logs with missing/Unknown student names", () => {
    const out = computeDisciplineIntelligence({
      logs: [log({ student: "Unknown" }), log({ student: "" }), log({ student: undefined })],
    });
    expect(out.behavioral_patterns).toHaveLength(0);
  });

  it("uses worst severity across a student's incidents", () => {
    const out = computeDisciplineIntelligence({
      logs: [
        log({ severity: "Low" }),
        log({ severity: "High", date: "2026-04-02" }),
        log({ severity: "Medium", date: "2026-04-03" }),
      ],
    });
    expect(out.behavioral_patterns[0].severity).toBe("High");
  });
});

describe("related_incidents — clusters", () => {
  it("does NOT surface clusters with <2 cases", () => {
    const out = computeDisciplineIntelligence({
      logs: [log({ type: "Bullying" })],
    });
    expect(out.related_incidents).toHaveLength(0);
  });

  it("surfaces a cluster when type appears >=2 times", () => {
    const out = computeDisciplineIntelligence({
      logs: [log({ type: "Bullying" }), log({ type: "Bullying", student: "Sam" })],
    });
    expect(out.related_incidents).toHaveLength(1);
    expect(out.related_incidents[0].cluster_name).toMatch(/Bullying/);
    expect(out.related_incidents[0].linked_cases).toBe(2);
  });

  it("flags location-driven clusters when ≥50% share a location", () => {
    const out = computeDisciplineIntelligence({
      logs: [
        log({ type: "Fight", location: "Playground", student: "A" }),
        log({ type: "Fight", location: "Playground", student: "B" }),
        log({ type: "Fight", location: "Library", student: "C" }),
      ],
    });
    const cluster = out.related_incidents[0];
    expect(cluster.common_factor).toMatch(/Playground/);
    expect(cluster.common_factor).toMatch(/location-driven/i);
  });

  it("calls out single-student clusters explicitly", () => {
    const out = computeDisciplineIntelligence({
      logs: [
        log({ type: "Late", student: "Solo" }),
        log({ type: "Late", student: "Solo" }),
      ],
    });
    expect(out.related_incidents[0].common_factor).toMatch(/single student/i);
  });

  it("sorts clusters by linked_cases descending", () => {
    const out = computeDisciplineIntelligence({
      logs: [
        log({ type: "A", student: "X" }), log({ type: "A", student: "Y" }),
        log({ type: "B", student: "X" }), log({ type: "B", student: "Y" }),
        log({ type: "B", student: "Z" }),
      ],
    });
    expect(out.related_incidents[0].linked_cases).toBeGreaterThanOrEqual(out.related_incidents[1]?.linked_cases ?? 0);
  });
});

describe("intervention_suggestions", () => {
  it("recommends counsellor referral when Critical/High students exist", () => {
    const logs = Array.from({ length: 3 }, (_, i) =>
      log({ student: "Alex", date: `2026-04-0${i+1}`, severity: "Critical" }),
    );
    const out = computeDisciplineIntelligence({ logs });
    expect(out.intervention_suggestions.some((s) => /counsellor/i.test(s.action))).toBe(true);
  });

  it("recommends supervision boost when location-cluster fires", () => {
    const out = computeDisciplineIntelligence({
      logs: [
        log({ type: "Fight", location: "Playground", student: "A" }),
        log({ type: "Fight", location: "Playground", student: "B" }),
      ],
    });
    expect(out.intervention_suggestions.some((s) => /supervision/i.test(s.action))).toBe(true);
  });

  it("recommends parent meetings when repeat patterns exist", () => {
    const logs = Array.from({ length: 3 }, (_, i) =>
      log({ student: "Alex", date: `2026-04-0${i+1}` }),
    );
    const out = computeDisciplineIntelligence({ logs });
    expect(out.intervention_suggestions.some((s) => /parent meet/i.test(s.action))).toBe(true);
  });

  it("triggers school-wide reset only when total logs >=15", () => {
    const fewLogs = computeDisciplineIntelligence({ logs: [log(), log({ student: "B" })] });
    expect(fewLogs.intervention_suggestions.some((s) => /assembly/i.test(s.action))).toBe(false);

    const manyLogs = Array.from({ length: 15 }, (_, i) =>
      log({ student: `S${i}`, date: `2026-04-0${(i%9)+1}` }),
    );
    const out = computeDisciplineIntelligence({ logs: manyLogs });
    expect(out.intervention_suggestions.some((s) => /assembly/i.test(s.action))).toBe(true);
  });

  it("returns positive-reinforcement when zero patterns + zero clusters", () => {
    const out = computeDisciplineIntelligence({ logs: [] });
    expect(out.intervention_suggestions[0].action).toMatch(/recognise|reinforce/i);
    expect(out.intervention_suggestions[0].priority).toBe("Low");
  });
});

describe("computeDisciplineIntelligence — defensive + determinism", () => {
  it("normalises severity strings (case-insensitive)", () => {
    const out = computeDisciplineIntelligence({
      logs: Array.from({ length: 3 }, (_, i) =>
        log({ student: "Q", date: `2026-04-0${i+1}`, severity: "critical" }),
      ),
    });
    expect(out.behavioral_patterns[0].severity).toBe("Critical");
  });

  it("identical input → identical output", () => {
    const input = { logs: [log(), log({ student: "Bob" })] };
    expect(computeDisciplineIntelligence(input)).toEqual(computeDisciplineIntelligence(input));
  });

  it("does not crash when logs is missing entirely", () => {
    const out = computeDisciplineIntelligence({} as any);
    expect(out.behavioral_patterns).toEqual([]);
  });
});
