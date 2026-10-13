"use client";

import React, { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Building2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  FolderKanban,
  LayoutList,
  Plus,
  Search,
  GripVertical,
  User,
  Layers,
} from "lucide-react";
import {
  TaskModal,
  type TaskFormValues,
  type TaskMedia,
  type TaskComment,
} from "@/components/TaskModal";

type Priority = "low" | "medium" | "high" | "urgent";
type ColumnId = "backlog" | "todo" | "in-progress" | "review" | "done";

type Task = {
  id: string;
  title: string;
  description?: string;
  column: ColumnId;
  client: string;
  project: string;
  priority: Priority;
  dueDate: string;
  assignee: string;
  media?: TaskMedia[];
  comments?: TaskComment[];
};

type ModalState =
  | { mode: "create"; defaults: TaskFormValues }
  | { mode: "edit"; taskId: string; values: TaskFormValues }
  | null;

type Scope =
  | { type: "all" }
  | { type: "client"; client: string }
  | { type: "project"; client: string; project: string };

const COLUMNS: { id: ColumnId; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "To do" },
  { id: "in-progress", label: "In progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

const INITIAL_TASKS: Task[] = [
  {
    id: "t1",
    title: "Finalize homepage wireframes",
    description: "Align sections with proposal deliverables",
    column: "in-progress",
    client: "Acme Corp",
    project: "Website redesign",
    priority: "high",
    dueDate: "Oct 14",
    assignee: "Sam",
    comments: [
      {
        id: "c1",
        author: "Alex",
        body: "Hero section looks good — can we tighten the CTA copy?",
        createdAt: "Yesterday",
      },
      {
        id: "c2",
        author: "Sam",
        body: "On it. Will attach updated frames tomorrow.",
        createdAt: "2h ago",
      },
    ],
  },
  {
    id: "t2",
    title: "Write proposal pricing options",
    column: "todo",
    client: "Globex Inc",
    project: "Brand identity",
    priority: "urgent",
    dueDate: "Oct 13",
    assignee: "Sam",
  },
  {
    id: "t3",
    title: "Collect brand assets from client",
    column: "todo",
    client: "Globex Inc",
    project: "Brand identity",
    priority: "medium",
    dueDate: "Oct 16",
    assignee: "Sam",
  },
  {
    id: "t4",
    title: "Send overdue reminder sequence",
    column: "review",
    client: "Acme Corp",
    project: "Website redesign",
    priority: "high",
    dueDate: "Oct 12",
    assignee: "Sam",
  },
  {
    id: "t5",
    title: "Invoice tracked consulting hours",
    column: "backlog",
    client: "Stark Industries",
    project: "Consulting",
    priority: "medium",
    dueDate: "Oct 18",
    assignee: "Sam",
  },
  {
    id: "t6",
    title: "Kickoff call notes into scope",
    column: "done",
    client: "Wayne Enterprises",
    project: "Retainer",
    priority: "low",
    dueDate: "Oct 10",
    assignee: "Sam",
  },
  {
    id: "t7",
    title: "Prepare milestone 2 presentation",
    column: "in-progress",
    client: "Globex Inc",
    project: "Brand identity",
    priority: "high",
    dueDate: "Oct 15",
    assignee: "Alex",
  },
  {
    id: "t8",
    title: "Review contract payment terms",
    column: "backlog",
    client: "Stark Industries",
    project: "Consulting",
    priority: "low",
    dueDate: "Oct 20",
    assignee: "Alex",
  },
  {
    id: "t9",
    title: "Design system tokens",
    column: "todo",
    client: "Acme Corp",
    project: "Website redesign",
    priority: "medium",
    dueDate: "Oct 17",
    assignee: "Sam",
  },
  {
    id: "t10",
    title: "Monthly reporting pack",
    column: "in-progress",
    client: "Wayne Enterprises",
    project: "Retainer",
    priority: "medium",
    dueDate: "Oct 19",
    assignee: "Alex",
  },
];

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-gray-100 text-gray-700",
  high: "bg-gray-900 text-white",
  urgent: "bg-gray-900 text-white",
};

function taskToFormValues(task: Task): TaskFormValues {
  return {
    title: task.title,
    description: task.description ?? "",
    column: task.column,
    client: task.client,
    project: task.project,
    priority: task.priority,
    dueDate: task.dueDate,
    assignee: task.assignee,
    media: task.media ?? [],
    comments: task.comments ?? [],
  };
}

function defaultsForScope(scope: Scope): TaskFormValues {
  return {
    title: "",
    description: "",
    column: "todo",
    client: scope.type === "all" ? "" : scope.client,
    project: scope.type === "project" ? scope.project : "",
    priority: "medium",
    dueDate: "",
    assignee: "Sam",
    media: [],
    comments: [],
  };
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [view, setView] = useState<"board" | "list">("board");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<Scope>({ type: "all" });
  const [modal, setModal] = useState<ModalState>(null);
  const [showPicker, setShowPicker] = useState(true);
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({
    "Acme Corp": true,
    "Globex Inc": true,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const workspace = useMemo(() => {
    const map = new Map<string, { projects: Map<string, number>; count: number }>();
    for (const task of tasks) {
      if (!map.has(task.client)) {
        map.set(task.client, { projects: new Map(), count: 0 });
      }
      const client = map.get(task.client)!;
      client.count += 1;
      client.projects.set(task.project, (client.projects.get(task.project) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([client, data]) => ({
        client,
        count: data.count,
        projects: Array.from(data.projects.entries())
          .map(([project, count]) => ({ project, count }))
          .sort((a, b) => a.project.localeCompare(b.project)),
      }))
      .sort((a, b) => a.client.localeCompare(b.client));
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (scope.type === "client" && task.client !== scope.client) return false;
      if (
        scope.type === "project" &&
        (task.client !== scope.client || task.project !== scope.project)
      ) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          task.title.toLowerCase().includes(q) ||
          task.client.toLowerCase().includes(q) ||
          task.project.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [tasks, scope, search]);

  const scopeLabel =
    scope.type === "all"
      ? "All work"
      : scope.type === "client"
        ? scope.client
        : `${scope.project}`;

  const scopeMeta =
    scope.type === "all"
      ? `${filteredTasks.length} tasks across ${workspace.length} clients`
      : scope.type === "client"
        ? `${filteredTasks.length} tasks · ${workspace.find((c) => c.client === scope.client)?.projects.length ?? 0} projects`
        : `${filteredTasks.length} tasks · ${scope.client}`;

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;

  function findColumn(taskId: string): ColumnId | null {
    return tasks.find((t) => t.id === taskId)?.column ?? null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeTaskId = String(active.id);
    const overId = String(over.id);

    const activeColumn = findColumn(activeTaskId);
    const overColumn = COLUMNS.some((c) => c.id === overId)
      ? (overId as ColumnId)
      : findColumn(overId);

    if (!activeColumn || !overColumn || activeColumn === overColumn) return;

    setTasks((prev) =>
      prev.map((task) =>
        task.id === activeTaskId ? { ...task, column: overColumn } : task
      )
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeTaskId = String(active.id);
    const overId = String(over.id);
    const activeColumn = findColumn(activeTaskId);
    const overColumn = COLUMNS.some((c) => c.id === overId)
      ? (overId as ColumnId)
      : findColumn(overId);

    if (!activeColumn || !overColumn) return;

    setTasks((prev) => {
      const columnTasks = prev.filter((t) => t.column === overColumn);
      const overIndex = COLUMNS.some((c) => c.id === overId)
        ? columnTasks.length - 1
        : columnTasks.findIndex((t) => t.id === overId);

      const withoutActive = prev.filter((t) => t.id !== activeTaskId);
      const moved = prev.find((t) => t.id === activeTaskId);
      if (!moved) return prev;

      const updatedMoved = { ...moved, column: overColumn };
      const insertAt = Math.max(0, Math.min(overIndex, columnTasks.length));

      const result: Task[] = [];
      let inserted = false;
      let colCursor = 0;

      for (const task of withoutActive) {
        if (task.column !== overColumn) {
          result.push(task);
          continue;
        }
        if (colCursor === insertAt && !inserted) {
          result.push(updatedMoved);
          inserted = true;
        }
        result.push(task);
        colCursor += 1;
      }
      if (!inserted) result.push(updatedMoved);
      return result;
    });
  }

  function toggleClient(client: string) {
    setExpandedClients((prev) => ({ ...prev, [client]: !prev[client] }));
  }

  const allClients = useMemo(
    () => Array.from(new Set(tasks.map((t) => t.client))).sort(),
    [tasks]
  );

  const allProjects = useMemo(() => {
    const source =
      scope.type === "client" || scope.type === "project"
        ? tasks.filter((t) => t.client === scope.client)
        : tasks;
    return Array.from(new Set(source.map((t) => t.project))).sort();
  }, [tasks, scope]);

  function openCreate(column: ColumnId = "todo") {
    setModal({
      mode: "create",
      defaults: { ...defaultsForScope(scope), column },
    });
  }

  function openEdit(task: Task) {
    setModal({
      mode: "edit",
      taskId: task.id,
      values: taskToFormValues(task),
    });
  }

  function handleSave(values: TaskFormValues) {
    if (!modal) return;

    if (modal.mode === "create") {
      const newTask: Task = {
        id: `t-${Date.now()}`,
        ...values,
        description: values.description || undefined,
        media: values.media.length ? values.media : undefined,
        comments: values.comments.length ? values.comments : undefined,
      };
      setTasks((prev) => [newTask, ...prev]);
      if (values.client) {
        setExpandedClients((prev) => ({ ...prev, [values.client]: true }));
      }
    } else {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === modal.taskId
            ? {
                ...task,
                ...values,
                description: values.description || undefined,
                media: values.media.length ? values.media : undefined,
                comments: values.comments.length ? values.comments : undefined,
              }
            : task
        )
      );
    }
    setModal(null);
  }

  function handleDelete() {
    if (!modal || modal.mode !== "edit") return;
    setTasks((prev) => prev.filter((task) => task.id !== modal.taskId));
    setModal(null);
  }

  function selectClient(client: string) {
    setScope({ type: "client", client });
    setExpandedClients((prev) => ({ ...prev, [client]: true }));
    setShowPicker(false);
  }

  function selectProject(client: string, project: string) {
    setScope({ type: "project", client, project });
    setExpandedClients((prev) => ({ ...prev, [client]: true }));
    setShowPicker(false);
  }

  function goBackToPicker() {
    setShowPicker(true);
  }

  if (showPicker) {
    return (
      <main className="h-full min-h-0 w-full flex">
        <aside className="w-full max-w-md border-r border-line flex flex-col min-h-0 bg-white">
          <div className="px-6 pt-10 pb-4 pr-36">
            <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">Tasks</h1>
            <p className="text-[15px] text-gray-500 mt-1.5">
              Choose a client or project to open its board.
            </p>
          </div>

          <div className="px-5 pb-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clients or projects..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-line bg-[#FAFBFC] text-sm outline-none focus:border-gray-300 focus:bg-white"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-3 pb-8 space-y-0.5">
            <button
              type="button"
              onClick={() => {
                setScope({ type: "all" });
                setShowPicker(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-left transition-colors text-gray-700 hover:bg-[#FAFBFC] border border-transparent"
            >
              <Layers className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-sm font-medium">All work</span>
              <span className="text-[11px] font-semibold text-gray-400">{tasks.length}</span>
            </button>

            <div className="pt-4 pb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Clients
            </div>

            {workspace.map(({ client, count, projects }) => {
              const expanded = expandedClients[client] ?? false;

              return (
                <div key={client} className="space-y-0.5">
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => toggleClient(client)}
                      className="w-7 h-9 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-[#FAFBFC] flex items-center justify-center shrink-0"
                      aria-label={expanded ? "Collapse" : "Expand"}
                    >
                      {expanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => selectClient(client)}
                      className="flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-left transition-colors text-gray-700 hover:bg-[#FAFBFC] border border-transparent"
                    >
                      <Building2 className="w-4 h-4 shrink-0 text-gray-500" />
                      <span className="flex-1 text-sm font-medium truncate">{client}</span>
                      <span className="text-[11px] font-semibold text-gray-400">{count}</span>
                    </button>
                  </div>

                  {expanded &&
                    projects.map(({ project, count: projectCount }) => (
                      <button
                        key={`${client}-${project}`}
                        type="button"
                        onClick={() => selectProject(client, project)}
                        className="w-full flex items-center gap-2.5 pl-10 pr-3 py-2.5 rounded-xl text-left transition-colors text-gray-600 hover:bg-[#FAFBFC] border border-transparent"
                      >
                        <FolderKanban className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                        <span className="flex-1 text-[13px] font-medium truncate">{project}</span>
                        <span className="text-[11px] font-semibold text-gray-400">
                          {projectCount}
                        </span>
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
        </aside>
        <div className="hidden md:flex flex-1 items-center justify-center text-sm text-gray-400 px-8">
          Select a client or project to view tasks
        </div>
      </main>
    );
  }

  return (
    <main className="h-full min-h-0 w-full flex">
      {/* Board / list */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="px-6 pt-8 pb-4 shrink-0 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={goBackToPicker}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors mb-3"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <div className="text-[12px] font-medium text-gray-400 mb-1">
              {scope.type === "project" ? scope.client : "Workspace"}
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 tracking-tight truncate">
              {scopeLabel}
            </h2>
            <p className="text-[13px] text-gray-500 mt-1">{scopeMeta}</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full border border-line bg-[#FAFBFC] p-1">
              <ViewToggle
                active={view === "board"}
                onClick={() => setView("board")}
                icon={Columns3}
                label="Board"
              />
              <ViewToggle
                active={view === "list"}
                onClick={() => setView("list")}
                icon={LayoutList}
                label="List"
              />
            </div>
            <button
              type="button"
              onClick={() => openCreate()}
              className="btn-primary inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm"
            >
              <Plus className="w-4 h-4" />
              Add task
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 px-6 pb-6">
          {filteredTasks.length === 0 ? (
            <div className="h-full rounded-2xl border border-dashed border-line flex flex-col items-center justify-center text-center px-6">
              <FolderKanban className="w-8 h-8 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-700">No tasks here yet</p>
              <p className="text-[13px] text-gray-400 mt-1 max-w-xs">
                Pick another client or project, or add a task to this workspace.
              </p>
              <button
                type="button"
                onClick={() => openCreate()}
                className="btn-primary mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add task
              </button>
            </div>
          ) : view === "board" ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <div className="h-full overflow-x-auto no-scrollbar">
                <div className="flex gap-3 h-full min-w-max pb-1">
                  {COLUMNS.map((column) => {
                    const columnTasks = filteredTasks.filter((t) => t.column === column.id);
                    return (
                      <KanbanColumn
                        key={column.id}
                        column={column}
                        tasks={columnTasks}
                        onAdd={() => openCreate(column.id)}
                        onEdit={openEdit}
                      />
                    );
                  })}
                </div>
              </div>
              <DragOverlay>
                {activeTask ? <TaskCard task={activeTask} overlay /> : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <ListView tasks={filteredTasks} onEdit={openEdit} />
          )}
        </div>
      </div>

      {modal && (
        <TaskModal
          mode={modal.mode}
          initialValues={modal.mode === "create" ? modal.defaults : modal.values}
          clients={allClients}
          projects={allProjects}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onDelete={modal.mode === "edit" ? handleDelete : undefined}
        />
      )}
    </main>
  );
}

function ViewToggle({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-white text-gray-900 shadow-sm border border-line"
          : "text-gray-500 hover:text-gray-800"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function KanbanColumn({
  column,
  tasks,
  onAdd,
  onEdit,
}: {
  column: (typeof COLUMNS)[number];
  tasks: Task[];
  onAdd: () => void;
  onEdit: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", columnId: column.id },
  });

  return (
    <section
      className={`w-[280px] shrink-0 flex flex-col rounded-2xl border border-line bg-[#FAFBFC] ${
        isOver ? "ring-2 ring-gray-300" : ""
      }`}
    >
      <header className="px-3.5 pt-3.5 pb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{column.label}</h3>
          <span className="text-[11px] font-semibold text-gray-400 bg-white border border-line rounded-full px-2 py-0.5">
            {tasks.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="w-7 h-7 rounded-lg text-gray-400 hover:text-[#2563EB] hover:bg-[#EFF6FF] flex items-center justify-center transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </header>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className="flex-1 min-h-[120px] overflow-y-auto no-scrollbar px-2.5 pb-2.5 space-y-2"
        >
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} onEdit={onEdit} />
          ))}
          {tasks.length === 0 && (
            <div className="h-20 rounded-xl border border-dashed border-gray-300/80 bg-white/50 flex items-center justify-center text-[13px] text-gray-400">
              Drop here
            </div>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableTaskCard({
  task,
  onEdit,
}: {
  task: Task;
  onEdit: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { type: "task", task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-40" : ""}>
      <TaskCard
        task={task}
        dragHandleProps={{ ...attributes, ...listeners }}
        onClick={() => onEdit(task)}
      />
    </div>
  );
}

function TaskCard({
  task,
  dragHandleProps,
  overlay = false,
  onClick,
}: {
  task: Task;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  overlay?: boolean;
  onClick?: () => void;
}) {
  return (
    <article
      onClick={onClick}
      className={`rounded-xl border border-line bg-white p-3 transition-colors ${
        overlay
          ? "shadow-xl rotate-1 scale-[1.02]"
          : "hover:border-gray-300 cursor-pointer"
      }`}
    >
      <div className="flex items-start gap-2 mb-2">
        {dragHandleProps && (
          <button
            type="button"
            className="mt-0.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
            {...dragHandleProps}
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-semibold text-gray-900 leading-snug">{task.title}</h3>
          {task.description && (
            <p className="text-[12px] text-gray-500 mt-1 leading-relaxed line-clamp-2">
              {task.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-2.5">
        <span
          className={`text-[10px] font-semibold capitalize rounded-full px-2 py-0.5 ${PRIORITY_STYLES[task.priority]}`}
        >
          {task.priority}
        </span>
      </div>

      <div className="flex items-center justify-between text-[11px] text-gray-500">
        <span className="font-medium text-gray-600 truncate">{task.project}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {task.dueDate}
          </span>
          <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-700 text-[10px] font-bold flex items-center justify-center">
            {task.assignee.slice(0, 1)}
          </span>
        </div>
      </div>
    </article>
  );
}

function ListView({
  tasks,
  onEdit,
}: {
  tasks: Task[];
  onEdit: (task: Task) => void;
}) {
  return (
    <div className="h-full overflow-y-auto no-scrollbar">
      <div className="rounded-2xl border border-line bg-white overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1.6fr)_130px_120px_100px_90px] gap-3 px-5 py-3 border-b border-line text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          <span>Task</span>
          <span>Project</span>
          <span>Priority</span>
          <span>Due</span>
          <span>Owner</span>
        </div>
        {tasks.map((task) => (
          <div
            key={task.id}
            onClick={() => onEdit(task)}
            className="grid grid-cols-[minmax(0,1.6fr)_130px_120px_100px_90px] gap-3 px-5 py-3.5 border-b border-line last:border-0 hover:bg-[#FAFBFC] transition-colors items-center cursor-pointer"
          >
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-gray-900 truncate">{task.title}</div>
              <div className="text-[12px] text-gray-400 mt-0.5 capitalize">
                {COLUMNS.find((c) => c.id === task.column)?.label}
              </div>
            </div>
            <div className="text-sm text-gray-500 truncate">{task.project}</div>
            <div>
              <span
                className={`text-[11px] font-semibold capitalize rounded-full px-2 py-0.5 ${PRIORITY_STYLES[task.priority]}`}
              >
                {task.priority}
              </span>
            </div>
            <div className="text-sm text-gray-500 inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {task.dueDate}
            </div>
            <div className="text-sm text-gray-700 inline-flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-gray-400" />
              {task.assignee}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
