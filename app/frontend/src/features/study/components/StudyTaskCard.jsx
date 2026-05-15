import React from "react";
import TaskReasoningPanel from "./TaskReasoningPanel";
import { Pill } from "../../../shared/ui/studyos";

// Task row styled after the prototype's `.task-row` grid: tick · time ·
// title+meta+reasoning · type/planned. The toggle + reasoning behaviour is
// unchanged — TaskReasoningPanel still lazily fetches /api/study/task-reasoning.
const STATUS_COPY = {
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  skipped: "Skipped",
  missed: "Missed",
  carried_forward: "Carried forward",
  rescheduled: "Rescheduled",
};

export default function StudyTaskCard({ task, onToggle }) {
  if (!task) return null;
  const status = task.status || (task.done ? "completed" : "planned");
  const done = status === "completed" || task.done;
  const skipped = status === "skipped" || status === "missed";
  const statusLabel = STATUS_COPY[status] || status;
  const planned = task.planned_minutes ?? task.duration_min ?? task.duration;
  const taskType = task.task_type
    ? String(task.task_type).replaceAll("_", " ")
    : null;

  return (
    <li className="task-row" data-testid={`task-${task.id}`}>
      <button
        type="button"
        onClick={() => onToggle && onToggle(task)}
        data-testid={`toggle-${task.id}`}
        className="mt-1.5 outline-none"
        aria-label={done ? "Mark as not done" : "Mark as done"}
        aria-pressed={done}
      >
        <span className={`tick ${done ? "done" : ""} ${skipped ? "skip" : ""}`} />
      </button>

      <div className="num-mono text-[12px] text-clay-700 pt-1">
        <div>{task.time || "Today"}</div>
        {planned ? <div className="text-[10.5px] opacity-70">{planned}m</div> : null}
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className={`text-[15px] leading-snug ${
              done ? "line-through text-clay-400" : "text-clay-900 font-medium"
            }`}
          >
            {task.title || "Untitled task"}
          </div>
          {status === "in_progress" ? <Pill tone="sage">In progress</Pill> : null}
          {status === "carried_forward" || status === "missed" ? (
            <Pill tone="amber">{statusLabel}</Pill>
          ) : null}
        </div>
        {task.subject || task.topic ? (
          <div className="text-[12px] text-clay-700 mt-1">
            {[task.subject, task.topic].filter(Boolean).join(" · ")}
          </div>
        ) : null}
        {task.id ? (
          <TaskReasoningPanel taskId={task.id} fallbackReasoning={task.reasoning} />
        ) : null}
      </div>

      <div className="pt-1.5 flex flex-col items-end gap-1.5">
        {taskType ? <Pill tone="outline">{taskType}</Pill> : null}
        <span className="num-mono text-[10.5px] text-clay-700">{statusLabel}</span>
      </div>
    </li>
  );
}
