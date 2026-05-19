// StudyHome imports lib/api which requires REACT_APP_BACKEND_URL at
// module-load time. Stub it so the pure helpers can be exercised
// without the env-var prerequisite.
jest.mock("../../lib/api", () => ({
  __esModule: true,
  api: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../../features/study/components/ExamCycleTimeline", () => () => null);
jest.mock("../../features/study/components/PlanChangeLogCard", () => () => null);

import { pickNextAction, formatDueRelative } from "./StudyHome";

function isoDaysFromToday(diff) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d.toISOString();
}

describe("StudyHome pickNextAction (PR10)", () => {
  test("returns null when there are no tasks", () => {
    expect(pickNextAction([])).toBeNull();
    expect(pickNextAction(null)).toBeNull();
    expect(pickNextAction(undefined)).toBeNull();
  });

  test("filters out completed / skipped / not_applicable / done=true", () => {
    const tasks = [
      { id: "a", status: "completed", scheduled_date: isoDaysFromToday(0) },
      { id: "b", done: true, scheduled_date: isoDaysFromToday(0) },
      { id: "c", status: "skipped", scheduled_date: isoDaysFromToday(0) },
      { id: "d", status: "not_applicable", scheduled_date: isoDaysFromToday(0) },
    ];
    expect(pickNextAction(tasks)).toBeNull();
  });

  test("floats overdue task to the top even when later tasks have earlier scheduled_date", () => {
    const tasks = [
      { id: "newer", status: "planned", scheduled_date: isoDaysFromToday(1) },
      { id: "overdue", status: "planned", due_date: isoDaysFromToday(-3) },
      { id: "future", status: "planned", scheduled_date: isoDaysFromToday(2) },
    ];
    expect(pickNextAction(tasks)?.t.id).toBe("overdue");
  });

  test("when multiple overdue, picks the earliest overdue date", () => {
    const tasks = [
      { id: "old", status: "planned", due_date: isoDaysFromToday(-5) },
      { id: "older", status: "planned", due_date: isoDaysFromToday(-9) },
      { id: "recent", status: "planned", due_date: isoDaysFromToday(-1) },
    ];
    expect(pickNextAction(tasks)?.t.id).toBe("older");
  });

  test("ties on date break by original array index (stable)", () => {
    const same = isoDaysFromToday(2);
    const tasks = [
      { id: "first", status: "planned", scheduled_date: same },
      { id: "second", status: "planned", scheduled_date: same },
      { id: "third", status: "planned", scheduled_date: same },
    ];
    expect(pickNextAction(tasks)?.t.id).toBe("first");
  });

  test("tasks with no date come after dated tasks", () => {
    const tasks = [
      { id: "no-date", status: "planned" },
      { id: "dated", status: "planned", scheduled_date: isoDaysFromToday(3) },
    ];
    expect(pickNextAction(tasks)?.t.id).toBe("dated");
  });

  test("accepts both `due_date` and `scheduled_date`", () => {
    const tasks = [
      { id: "due", status: "planned", due_date: isoDaysFromToday(1) },
      { id: "sched", status: "planned", scheduled_date: isoDaysFromToday(0) },
    ];
    expect(pickNextAction(tasks)?.t.id).toBe("sched");
  });
});

describe("formatDueRelative", () => {
  test("today / tomorrow / overdue / future", () => {
    expect(formatDueRelative(isoDaysFromToday(0))).toBe("Today");
    expect(formatDueRelative(isoDaysFromToday(1))).toBe("Tomorrow");
    expect(formatDueRelative(isoDaysFromToday(-1))).toBe("Overdue 1d");
    expect(formatDueRelative(isoDaysFromToday(-2))).toBe("Overdue 2d");
    expect(formatDueRelative(isoDaysFromToday(3))).toBe("In 3d");
  });

  test("returns null for missing / invalid", () => {
    expect(formatDueRelative(null)).toBeNull();
    expect(formatDueRelative("not-a-date")).toBeNull();
  });
});
