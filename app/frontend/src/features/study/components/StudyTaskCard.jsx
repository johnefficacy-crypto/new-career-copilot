import React from "react";
import { CheckCircle2, Circle } from "lucide-react";
import TaskReasoningPanel from "./TaskReasoningPanel";

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
  const statusLabel = STATUS_COPY[status] || status;

  return (
    <li
      className="flex items-start gap-3 rounded-xl p-3 hover:bg-clay-50 transition"
      data-testid={`task-${task.id}`}
    >
      <button
        type="button"
        onClick={() => onToggle && onToggle(task)}
        data-testid={`toggle-${task.id}`}
        className="mt-0.5"
        aria-label={task.done ? "Mark as not done" : "Mark as done"}
      >
        {task.done ? (
          <CheckCircle2 className="h-5 w-5 text-sage-500" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
            {task.time || "Today"}
          </div>
          {task.task_type ? (
            <span className="pill text-[10px] uppercase tracking-wider text-muted-foreground">
              {String(task.task_type).replaceAll("_", " ")}
            </span>
          ) : null}
          <span
            className={`pill text-[10px] uppercase tracking-wider ${
              status === "completed"
                ? "text-sage-700"
                : status === "missed" || status === "carried_forward"
                  ? "text-dusk-700"
                  : "text-muted-foreground"
            }`}
          >
            {statusLabel}
          </span>
        </div>
        <div
          className={`text-[15px] ${
            task.done ? "line-through text-muted-foreground" : "font-medium"
          }`}
        >
          {task.title || "Untitled task"}
        </div>
        {task.subject || task.topic ? (
          <div className="text-xs text-muted-foreground mt-0.5">
            {[task.subject, task.topic].filter(Boolean).join(" · ")}
          </div>
        ) : null}
        {task.reasoning ? <TaskReasoningPanel reasoning={task.reasoning} /> : null}
      </div>
    </li>
  );
}
