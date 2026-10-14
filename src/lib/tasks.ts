import type { Enums } from "@/types/database";

export type UiTaskColumn = "backlog" | "todo" | "in-progress" | "review" | "done";
export type DbTaskColumn = Enums<"task_column">;
export type TaskPriority = Enums<"task_priority">;

export const TASK_COLUMNS: { id: UiTaskColumn; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "To do" },
  { id: "in-progress", label: "In progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

export function toUiColumn(column: DbTaskColumn): UiTaskColumn {
  return column === "in_progress" ? "in-progress" : column;
}

export function toDbColumn(column: UiTaskColumn): DbTaskColumn {
  return column === "in-progress" ? "in_progress" : column;
}

export function formatTaskDueDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatCommentTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfThatDay = new Date(date);
  startOfThatDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfThatDay.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return `${dayDiff}d ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function clientDisplayName(client: {
  name: string;
  company: string | null;
}) {
  return client.company?.trim() || client.name;
}
