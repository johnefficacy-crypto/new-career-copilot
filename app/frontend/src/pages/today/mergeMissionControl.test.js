import { mergeMissionControl } from "./mergeMissionControl";

const DEFAULTS = {
  user_context: { dimensions: {}, scores: {}, safe_user_explanation: [] },
  metrics: {
    tasks_total: 0,
    tasks_completed: 0,
    task_completion_rate: 0,
    hours_studied_7d: 0,
    adherence: null,
    backlog_count: 0,
  },
  truth_panel: { summary: "", warnings: [], corrections: [] },
  today_tasks: [],
  plan: null,
  meta: {},
};

test("returns defaults unchanged when data is null", () => {
  expect(mergeMissionControl(DEFAULTS, null)).toEqual(DEFAULTS);
});

test("returns defaults unchanged when data is undefined", () => {
  expect(mergeMissionControl(DEFAULTS, undefined)).toEqual(DEFAULTS);
});

test("returns defaults unchanged when data is not an object", () => {
  expect(mergeMissionControl(DEFAULTS, "garbage")).toEqual(DEFAULTS);
  expect(mergeMissionControl(DEFAULTS, 42)).toEqual(DEFAULTS);
});

test("preserves nested defaults when backend returns sparse metrics", () => {
  const partial = { metrics: { tasks_total: 5, tasks_completed: 2 } };
  const result = mergeMissionControl(DEFAULTS, partial);
  expect(result.metrics.tasks_total).toBe(5);
  expect(result.metrics.tasks_completed).toBe(2);
  // Critical: the fields the backend didn't send must survive.
  expect(result.metrics.task_completion_rate).toBe(0);
  expect(result.metrics.hours_studied_7d).toBe(0);
  expect(result.metrics.adherence).toBeNull();
  expect(result.metrics.backlog_count).toBe(0);
});

test("preserves nested defaults across multiple top-level objects", () => {
  const partial = {
    user_context: { dimensions: { focus_minutes: 120 } },
    truth_panel: { summary: "Solid week." },
  };
  const result = mergeMissionControl(DEFAULTS, partial);
  expect(result.user_context.dimensions.focus_minutes).toBe(120);
  expect(result.user_context.scores).toEqual({});
  expect(result.user_context.safe_user_explanation).toEqual([]);
  expect(result.truth_panel.summary).toBe("Solid week.");
  expect(result.truth_panel.warnings).toEqual([]);
  expect(result.truth_panel.corrections).toEqual([]);
});

test("backend null overrides the default (caller asked for null)", () => {
  const partial = { plan: { theme: "Quant week" } };
  const result = mergeMissionControl(DEFAULTS, partial);
  expect(result.plan).toEqual({ theme: "Quant week" });
});

test("arrays are not deep-merged — backend value replaces default", () => {
  const partial = { today_tasks: [{ id: "t1" }, { id: "t2" }] };
  const result = mergeMissionControl(DEFAULTS, partial);
  expect(result.today_tasks).toEqual([{ id: "t1" }, { id: "t2" }]);
});

test("undefined values in backend response fall back to defaults", () => {
  const partial = { metrics: undefined, plan: undefined };
  const result = mergeMissionControl(DEFAULTS, partial);
  expect(result.metrics).toBe(DEFAULTS.metrics);
  expect(result.plan).toBeNull();
});

test("unknown keys from backend are preserved (forward compatibility)", () => {
  const partial = { future_field: { nested: true } };
  const result = mergeMissionControl(DEFAULTS, partial);
  expect(result.future_field).toEqual({ nested: true });
});
