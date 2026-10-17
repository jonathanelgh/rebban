"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  type TaskOption,
  type TaskProjectOption,
  type TaskMemberOption,
} from "@/components/TaskModal";
import { CreateProjectModal } from "@/components/CreateProjectModal";
import { useProfile } from "@/components/ProfileContext";
import { createClient } from "@/lib/supabase/client";
import {
  TASK_COLUMNS,
  clientDisplayName,
  formatCommentTime,
  formatTaskDueDate,
  toDbColumn,
  toUiColumn,
  type TaskPriority,
  type UiTaskColumn,
} from "@/lib/tasks";

type ColumnId = UiTaskColumn;
type Priority = TaskPriority;

type Task = {
  id: string;
  title: string;
  description?: string;
  column: ColumnId;
  clientId: string | null;
  clientName: string;
  projectId: string | null;
  projectName: string;
  priority: Priority;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName: string;
  position: number;
  media: TaskMedia[];
  comments: TaskComment[];
};

type ModalState =
  | { mode: "create"; defaults: TaskFormValues }
  | { mode: "edit"; taskId: string; values: TaskFormValues; original: Task }
  | null;

type Scope =
  | { type: "all" }
  | { type: "client"; clientId: string; clientName: string }
  | {
      type: "project";
      clientId: string;
      clientName: string;
      projectId: string;
      projectName: string;
    };

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
    clientId: task.clientId ?? "",
    projectId: task.projectId ?? "",
    newProjectName: "",
    priority: task.priority,
    dueDate: task.dueDate ?? "",
    assigneeId: task.assigneeId ?? "",
    media: task.media,
    comments: task.comments,
  };
}

function emptyForm(defaults?: Partial<TaskFormValues>): TaskFormValues {
  return {
    title: "",
    description: "",
    column: "todo",
    clientId: "",
    projectId: "",
    newProjectName: "",
    priority: "medium",
    dueDate: "",
    assigneeId: "",
    media: [],
    comments: [],
    ...defaults,
  };
}

export default function TasksPage() {
  return (
    <Suspense
      fallback={
        <main className="h-full min-h-0 w-full flex items-center justify-center">
          <p className="text-sm text-gray-400">Loading…</p>
        </main>
      }
    >
      <TasksPageInner />
    </Suspense>
  );
}

function TasksPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    userId,
    fullName,
    organizationId,
    loading: profileLoading,
  } = useProfile();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<TaskOption[]>([]);
  const [projects, setProjects] = useState<TaskProjectOption[]>([]);
  const [members, setMembers] = useState<TaskMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [view, setView] = useState<"board" | "list">("board");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");
  const [scope, setScope] = useState<Scope>({ type: "all" });
  const [modal, setModal] = useState<ModalState>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createProjectClientId, setCreateProjectClientId] = useState<
    string | null
  >(null);
  const [showPicker, setShowPicker] = useState(true);
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>(
    {}
  );

  function openCreateProject(clientId?: string | null) {
    setCreateProjectClientId(
      clientId ||
        (scope.type === "client" || scope.type === "project"
          ? scope.clientId
          : null)
    );
    setCreateProjectOpen(true);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const loadWorkspace = useCallback(async () => {
    if (!organizationId) {
      setTasks([]);
      setClients([]);
      setProjects([]);
      setMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    const [clientsRes, projectsRes, tasksRes, membersRes] = await Promise.all([
      supabase
        .from("clients")
        .select("id, name, company")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("projects")
        .select("id, name, client_id")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("tasks")
        .select(
          `
          id, title, description, column_id, priority, due_date, position,
          client_id, project_id, assignee_id, created_at,
          clients ( id, name, company ),
          projects ( id, name ),
          task_comments ( id, body, author_id, created_at, deleted_at ),
          task_attachments ( id, file_name, file_type, file_size, storage_path, deleted_at )
        `
        )
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("position", { ascending: true }),
      supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("status", "active"),
    ]);

    if (clientsRes.error || projectsRes.error || tasksRes.error || membersRes.error) {
      setError(
        clientsRes.error?.message ||
          projectsRes.error?.message ||
          tasksRes.error?.message ||
          membersRes.error?.message ||
          "Failed to load tasks."
      );
      setLoading(false);
      return;
    }

    const memberIds = (membersRes.data ?? []).map((m) => m.user_id);
    const profileIds = Array.from(
      new Set([
        ...memberIds,
        ...((tasksRes.data ?? [])
          .flatMap((t) => [
            t.assignee_id,
            ...((t.task_comments as { author_id: string; deleted_at: string | null }[] | null) ?? [])
              .filter((c) => !c.deleted_at)
              .map((c) => c.author_id),
          ])
          .filter(Boolean) as string[]),
      ])
    );

    let profileMap = new Map<string, string>();
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", profileIds);
      profileMap = new Map(
        (profiles ?? []).map((p) => [
          p.id,
          p.full_name?.trim() || p.email?.trim() || "Member",
        ])
      );
    }

    const clientOptions: TaskOption[] = (clientsRes.data ?? []).map((c) => ({
      id: c.id,
      name: clientDisplayName(c),
    }));

    const projectOptions: TaskProjectOption[] = (projectsRes.data ?? []).map(
      (p) => ({
        id: p.id,
        name: p.name,
        clientId: p.client_id,
      })
    );

    const memberOptions: TaskMemberOption[] = memberIds.map((id) => ({
      id,
      name: profileMap.get(id) || (id === userId ? fullName || "You" : "Member"),
    }));
    if (userId && !memberOptions.some((m) => m.id === userId)) {
      memberOptions.unshift({ id: userId, name: fullName || "You" });
    }

    const nextTasks: Task[] = await Promise.all(
      (tasksRes.data ?? []).map(async (row) => {
        const clientRel = row.clients as
          | { id: string; name: string; company: string | null }
          | null
          | undefined;
        const projectRel = row.projects as
          | { id: string; name: string }
          | null
          | undefined;
        const commentsRaw =
          (row.task_comments as
            | {
                id: string;
                body: string;
                author_id: string;
                created_at: string;
                deleted_at: string | null;
              }[]
            | null) ?? [];
        const attachmentsRaw =
          (row.task_attachments as
            | {
                id: string;
                file_name: string;
                file_type: string | null;
                file_size: number | null;
                storage_path: string;
                deleted_at: string | null;
              }[]
            | null) ?? [];

        const media: TaskMedia[] = [];
        for (const attachment of attachmentsRaw.filter((a) => !a.deleted_at)) {
          const { data: signed } = await supabase.storage
            .from("task-media")
            .createSignedUrl(attachment.storage_path, 60 * 60 * 12);
          media.push({
            id: attachment.id,
            name: attachment.file_name,
            type: attachment.file_type || "application/octet-stream",
            size: attachment.file_size || 0,
            url: signed?.signedUrl || "",
            storagePath: attachment.storage_path,
          });
        }

        return {
          id: row.id,
          title: row.title,
          description: row.description || undefined,
          column: toUiColumn(row.column_id),
          clientId: row.client_id,
          clientName: clientRel
            ? clientDisplayName(clientRel)
            : "No client",
          projectId: row.project_id,
          projectName: projectRel?.name || "No project",
          priority: row.priority,
          dueDate: row.due_date,
          assigneeId: row.assignee_id,
          assigneeName: row.assignee_id
            ? profileMap.get(row.assignee_id) || "Member"
            : "—",
          position: Number(row.position) || 0,
          media,
          comments: commentsRaw
            .filter((c) => !c.deleted_at)
            .sort(
              (a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )
            .map((c) => ({
              id: c.id,
              author: profileMap.get(c.author_id) || "Member",
              authorId: c.author_id,
              body: c.body,
              createdAt: formatCommentTime(c.created_at),
            })),
        };
      })
    );

    setClients(clientOptions);
    setProjects(projectOptions);
    setMembers(memberOptions);
    setTasks(nextTasks);
    setExpandedClients((prev) => {
      const next = { ...prev };
      for (const client of clientOptions) {
        if (next[client.id] === undefined) next[client.id] = true;
      }
      return next;
    });
    setLoading(false);
  }, [organizationId, userId, fullName]);

  useEffect(() => {
    if (profileLoading) return;
    void loadWorkspace();
  }, [profileLoading, loadWorkspace]);

  const workspace = useMemo(() => {
    return clients
      .map((client) => {
        const clientProjects = projects.filter((p) => p.clientId === client.id);
        const clientTasks = tasks.filter((t) => t.clientId === client.id);
        return {
          clientId: client.id,
          clientName: client.name,
          count: clientTasks.length,
          projects: clientProjects
            .map((project) => ({
              projectId: project.id,
              projectName: project.name,
              count: tasks.filter((t) => t.projectId === project.id).length,
            }))
            .sort((a, b) => a.projectName.localeCompare(b.projectName)),
        };
      })
      .filter((entry) => {
        if (!pickerSearch.trim()) return true;
        const q = pickerSearch.toLowerCase();
        return (
          entry.clientName.toLowerCase().includes(q) ||
          entry.projects.some((p) => p.projectName.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [clients, projects, tasks, pickerSearch]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        if (scope.type === "client" && task.clientId !== scope.clientId) {
          return false;
        }
        if (scope.type === "project" && task.projectId !== scope.projectId) {
          return false;
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          return (
            task.title.toLowerCase().includes(q) ||
            task.clientName.toLowerCase().includes(q) ||
            task.projectName.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  }, [tasks, scope, search]);

  const scopeLabel =
    scope.type === "all"
      ? "All work"
      : scope.type === "client"
        ? scope.clientName
        : scope.projectName;

  const scopeMeta =
    scope.type === "all"
      ? `${filteredTasks.length} tasks across ${clients.length} clients`
      : scope.type === "client"
        ? `${filteredTasks.length} tasks · ${projects.filter((p) => p.clientId === scope.clientId).length} projects`
        : `${filteredTasks.length} tasks · ${scope.clientName}`;

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
    const overColumn = TASK_COLUMNS.some((c) => c.id === overId)
      ? (overId as ColumnId)
      : findColumn(overId);

    if (!activeColumn || !overColumn || activeColumn === overColumn) return;

    setTasks((prev) =>
      prev.map((task) =>
        task.id === activeTaskId ? { ...task, column: overColumn } : task
      )
    );
  }

  async function persistColumnPositions(nextTasks: Task[], column: ColumnId) {
    if (!organizationId) return;
    const supabase = createClient();
    const ordered = nextTasks
      .filter((t) => t.column === column)
      .sort((a, b) => a.position - b.position);
    await Promise.all(
      ordered.map((task, index) =>
        supabase
          .from("tasks")
          .update({
            column_id: toDbColumn(column),
            position: index,
          })
          .eq("id", task.id)
          .eq("organization_id", organizationId)
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
    const overColumn = TASK_COLUMNS.some((c) => c.id === overId)
      ? (overId as ColumnId)
      : findColumn(overId);

    if (!activeColumn || !overColumn) return;

    setTasks((prev) => {
      const columnTasks = prev
        .filter((t) => t.column === overColumn && t.id !== activeTaskId)
        .sort((a, b) => a.position - b.position);
      const overIndex = TASK_COLUMNS.some((c) => c.id === overId)
        ? columnTasks.length
        : Math.max(
            0,
            columnTasks.findIndex((t) => t.id === overId)
          );

      const moved = prev.find((t) => t.id === activeTaskId);
      if (!moved) return prev;

      const reordered = [...columnTasks];
      reordered.splice(overIndex === -1 ? reordered.length : overIndex, 0, {
        ...moved,
        column: overColumn,
      });

      const withPositions = reordered.map((task, index) => ({
        ...task,
        column: overColumn,
        position: index,
      }));

      const next = prev.map((task) => {
        const updated = withPositions.find((t) => t.id === task.id);
        return updated || task;
      });

      const columnsToPersist = Array.from(
        new Set([activeColumn, overColumn])
      );
      void (async () => {
        for (const column of columnsToPersist) {
          await persistColumnPositions(next, column);
        }
      })();

      return next;
    });
  }

  function defaultsForScope(current: Scope): TaskFormValues {
    return emptyForm({
      column: "todo",
      clientId: current.type === "all" ? "" : current.clientId,
      projectId: current.type === "project" ? current.projectId : "",
      assigneeId: userId || "",
    });
  }

  function openCreate(column: ColumnId = "todo") {
    setModalError(null);
    setModal({
      mode: "create",
      defaults: { ...defaultsForScope(scope), column },
    });
  }

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    openCreate();
    router.replace("/tasks", { scroll: false });
    // Intentionally only react to the query flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  function openEdit(task: Task) {
    setModalError(null);
    setModal({
      mode: "edit",
      taskId: task.id,
      values: taskToFormValues(task),
      original: task,
    });
  }

  async function ensureProjectId(values: TaskFormValues) {
    if (!organizationId || !userId) {
      throw new Error("Workspace not ready.");
    }
    if (values.projectId) return values.projectId;
    if (!values.newProjectName) return null;
    if (!values.clientId) {
      throw new Error("Choose a client before creating a project.");
    }

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("projects")
      .insert({
        organization_id: organizationId,
        client_id: values.clientId,
        name: values.newProjectName,
        created_by: userId,
        status: "active",
      })
      .select("id, name, client_id")
      .single();

    if (insertError || !data) {
      throw new Error(insertError?.message || "Could not create project.");
    }

    setProjects((prev) => [
      ...prev,
      { id: data.id, name: data.name, clientId: data.client_id },
    ]);
    return data.id;
  }

  async function syncAttachments(
    taskId: string,
    nextMedia: TaskMedia[],
    previous: TaskMedia[]
  ) {
    if (!organizationId || !userId) return;
    const supabase = createClient();
    const keptIds = new Set(
      nextMedia.filter((m) => !m.isNew && !m.file).map((m) => m.id)
    );
    const removed = previous.filter((m) => !m.isNew && !keptIds.has(m.id));

    if (removed.length > 0) {
      await supabase
        .from("task_attachments")
        .update({ deleted_at: new Date().toISOString() })
        .in(
          "id",
          removed.map((m) => m.id)
        );
    }

    for (const item of nextMedia.filter((m) => m.isNew && m.file)) {
      const file = item.file!;
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${organizationId}/${taskId}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("task-media")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);

      const { error: rowError } = await supabase.from("task_attachments").insert({
        organization_id: organizationId,
        task_id: taskId,
        uploaded_by: userId,
        file_name: file.name,
        file_type: file.type || null,
        file_size: file.size,
        storage_path: path,
      });
      if (rowError) throw new Error(rowError.message);
    }
  }

  async function syncComments(
    taskId: string,
    nextComments: TaskComment[],
    previous: TaskComment[]
  ) {
    if (!organizationId || !userId) return;
    const supabase = createClient();
    const keptIds = new Set(
      nextComments.filter((c) => !c.isNew).map((c) => c.id)
    );
    const removed = previous.filter((c) => !c.isNew && !keptIds.has(c.id));

    if (removed.length > 0) {
      await supabase
        .from("task_comments")
        .update({ deleted_at: new Date().toISOString() })
        .in(
          "id",
          removed.map((c) => c.id)
        );
    }

    const created = nextComments.filter((c) => c.isNew && c.body.trim());
    if (created.length > 0) {
      const { error: insertError } = await supabase.from("task_comments").insert(
        created.map((c) => ({
          organization_id: organizationId,
          task_id: taskId,
          author_id: userId,
          body: c.body.trim(),
        }))
      );
      if (insertError) throw new Error(insertError.message);
    }
  }

  async function handleSave(values: TaskFormValues) {
    if (!modal || !organizationId || !userId) return;
    setModalBusy(true);
    setModalError(null);

    try {
      const supabase = createClient();
      const projectId = await ensureProjectId(values);
      const columnTasks = tasks.filter(
        (t) =>
          t.column === values.column &&
          (modal.mode === "create" || t.id !== modal.taskId)
      );
      const nextPosition =
        modal.mode === "create"
          ? columnTasks.length
          : tasks.find((t) => t.id === modal.taskId)?.position ?? 0;

      const payload = {
        title: values.title.trim(),
        description: values.description.trim() || null,
        column_id: toDbColumn(values.column),
        priority: values.priority,
        due_date: values.dueDate || null,
        client_id: values.clientId || null,
        project_id: projectId,
        assignee_id: values.assigneeId || null,
        position: nextPosition,
      };

      let taskId = modal.mode === "edit" ? modal.taskId : "";

      if (modal.mode === "create") {
        const { data, error: insertError } = await supabase
          .from("tasks")
          .insert({
            ...payload,
            organization_id: organizationId,
            created_by: userId,
          })
          .select("id")
          .single();
        if (insertError || !data) {
          throw new Error(insertError?.message || "Could not create task.");
        }
        taskId = data.id;
        await syncAttachments(taskId, values.media, []);
        await syncComments(taskId, values.comments, []);
      } else {
        const { error: updateError } = await supabase
          .from("tasks")
          .update(payload)
          .eq("id", taskId)
          .eq("organization_id", organizationId);
        if (updateError) throw new Error(updateError.message);
        await syncAttachments(taskId, values.media, modal.original.media);
        await syncComments(taskId, values.comments, modal.original.comments);
      }

      setModal(null);
      await loadWorkspace();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Could not save task.");
    } finally {
      setModalBusy(false);
    }
  }

  async function handleDelete() {
    if (!modal || modal.mode !== "edit" || !organizationId) return;
    setModalBusy(true);
    setModalError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", modal.taskId)
      .eq("organization_id", organizationId);

    if (deleteError) {
      setModalError(deleteError.message);
      setModalBusy(false);
      return;
    }

    setModal(null);
    setModalBusy(false);
    await loadWorkspace();
  }

  function selectClient(clientId: string, clientName: string) {
    setScope({ type: "client", clientId, clientName });
    setExpandedClients((prev) => ({ ...prev, [clientId]: true }));
    setShowPicker(false);
    setSearch("");
  }

  function selectProject(
    clientId: string,
    clientName: string,
    projectId: string,
    projectName: string
  ) {
    setScope({ type: "project", clientId, clientName, projectId, projectName });
    setExpandedClients((prev) => ({ ...prev, [clientId]: true }));
    setShowPicker(false);
    setSearch("");
  }

  if (profileLoading || loading) {
    return (
      <main className="h-full min-h-0 w-full flex items-center justify-center text-sm text-gray-500">
        Loading tasks…
      </main>
    );
  }

  if (!organizationId) {
    return (
      <main className="h-full min-h-0 w-full flex items-center justify-center text-sm text-gray-500 px-6 text-center">
        Join or create a workspace to manage tasks.
      </main>
    );
  }

  if (showPicker) {
    return (
      <main className="h-full min-h-0 w-full flex">
        <aside className="w-full max-w-md border-r border-line flex flex-col min-h-0 bg-white">
          <div className="px-6 pt-10 pb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
                Tasks
              </h1>
              <p className="text-[15px] text-gray-500 mt-1.5">
                Choose a client or project to open its board.
              </p>
            </div>
            {clients.length > 0 && (
              <button
                type="button"
                onClick={() => openCreateProject()}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                <Plus className="w-4 h-4" />
                Project
              </button>
            )}
          </div>

          <div className="px-5 pb-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search clients or projects..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-line bg-[#FAFBFC] text-sm outline-none focus:border-gray-300 focus:bg-white"
              />
            </div>
          </div>

          {error && (
            <p className="mx-5 mb-3 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-3 pb-8 space-y-0.5">
            <button
              type="button"
              onClick={() => {
                setScope({ type: "all" });
                setShowPicker(false);
                setSearch("");
              }}
              className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-left transition-colors text-gray-700 hover:bg-[#FAFBFC] border border-transparent"
            >
              <Layers className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-sm font-medium">All work</span>
              <span className="text-[11px] font-semibold text-gray-400">
                {tasks.length}
              </span>
            </button>

            <div className="pt-4 pb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Clients
            </div>

            {workspace.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <p className="text-sm text-gray-600">No clients yet.</p>
                <p className="text-[13px] text-gray-400 mt-1">
                  Add a client first, then create tasks here.
                </p>
                <Link
                  href="/clients"
                  className="inline-flex mt-4 text-sm font-medium text-[#2563EB]"
                >
                  Go to clients
                </Link>
              </div>
            ) : (
              workspace.map(({ clientId, clientName, count, projects: clientProjects }) => {
                const expanded = expandedClients[clientId] ?? false;
                return (
                  <div key={clientId} className="space-y-0.5">
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedClients((prev) => ({
                            ...prev,
                            [clientId]: !expanded,
                          }))
                        }
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
                        onClick={() => selectClient(clientId, clientName)}
                        className="flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-left transition-colors text-gray-700 hover:bg-[#FAFBFC] border border-transparent"
                      >
                        <Building2 className="w-4 h-4 shrink-0 text-gray-500" />
                        <span className="flex-1 text-sm font-medium truncate">
                          {clientName}
                        </span>
                        <span className="text-[11px] font-semibold text-gray-400">
                          {count}
                        </span>
                      </button>
                    </div>

                    {expanded && (
                      <div className="space-y-0.5">
                        {clientProjects.length === 0 ? (
                          <p className="pl-10 pr-3 py-1.5 text-[12px] text-gray-400">
                            No projects yet
                          </p>
                        ) : (
                          clientProjects.map(
                            ({
                              projectId,
                              projectName,
                              count: projectCount,
                            }) => (
                              <button
                                key={projectId}
                                type="button"
                                onClick={() =>
                                  selectProject(
                                    clientId,
                                    clientName,
                                    projectId,
                                    projectName
                                  )
                                }
                                className="w-full flex items-center gap-2.5 pl-10 pr-3 py-2.5 rounded-xl text-left transition-colors text-gray-600 hover:bg-[#FAFBFC] border border-transparent"
                              >
                                <FolderKanban className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                                <span className="flex-1 text-[13px] font-medium truncate">
                                  {projectName}
                                </span>
                                <span className="text-[11px] font-semibold text-gray-400">
                                  {projectCount}
                                </span>
                              </button>
                            )
                          )
                        )}
                        <button
                          type="button"
                          onClick={() => openCreateProject(clientId)}
                          className="w-full flex items-center gap-2.5 pl-10 pr-3 py-2 rounded-xl text-left text-[13px] font-medium text-[#2563EB] hover:bg-[#EFF6FF] transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5 shrink-0" />
                          Create project
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>
        <div className="hidden md:flex flex-1 items-center justify-center text-sm text-gray-400 px-8">
          Select a client or project to view tasks
        </div>

        {createProjectOpen && organizationId && userId && (
          <CreateProjectModal
            organizationId={organizationId}
            userId={userId}
            clients={clients}
            initialClientId={createProjectClientId}
            onClose={() => {
              setCreateProjectOpen(false);
              setCreateProjectClientId(null);
            }}
            onCreated={(project) => {
              setProjects((prev) => [
                ...prev,
                {
                  id: project.id,
                  name: project.name,
                  clientId: project.clientId,
                },
              ]);
              setCreateProjectOpen(false);
              setCreateProjectClientId(null);
              selectProject(
                project.clientId,
                project.clientName,
                project.id,
                project.name
              );
            }}
          />
        )}
      </main>
    );
  }

  return (
    <main className="h-full min-h-0 w-full flex">
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="px-6 pt-8 pb-4 shrink-0 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors mb-3"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <div className="text-[12px] font-medium text-gray-400 mb-1">
              {scope.type === "project" ? scope.clientName : "Workspace"}
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 tracking-tight truncate">
              {scopeLabel}
            </h2>
            <p className="text-[13px] text-gray-500 mt-1">{scopeMeta}</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks…"
                className="w-44 pl-9 pr-3 py-2 rounded-full border border-line bg-[#FAFBFC] text-sm outline-none focus:border-gray-300 focus:bg-white"
              />
            </div>
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
              onClick={() => openCreateProject()}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <FolderKanban className="w-4 h-4 text-emerald-600" />
              New project
            </button>
            <button
              type="button"
              onClick={() => openCreate()}
              className="btn-primary hidden md:inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm"
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
                  {TASK_COLUMNS.map((column) => {
                    const columnTasks = filteredTasks.filter(
                      (t) => t.column === column.id
                    );
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

      {createProjectOpen && organizationId && userId && (
        <CreateProjectModal
          organizationId={organizationId}
          userId={userId}
          clients={clients}
          initialClientId={createProjectClientId}
          onClose={() => {
            setCreateProjectOpen(false);
            setCreateProjectClientId(null);
          }}
          onCreated={(project) => {
            setProjects((prev) => [
              ...prev,
              {
                id: project.id,
                name: project.name,
                clientId: project.clientId,
              },
            ]);
            setCreateProjectOpen(false);
            setCreateProjectClientId(null);
            selectProject(
              project.clientId,
              project.clientName,
              project.id,
              project.name
            );
            setShowPicker(false);
          }}
        />
      )}

      {modal && (
        <TaskModal
          mode={modal.mode}
          initialValues={modal.mode === "create" ? modal.defaults : modal.values}
          clients={clients}
          projects={projects}
          members={members}
          busy={modalBusy}
          error={modalError}
          onClose={() => {
            if (!modalBusy) {
              setModal(null);
              setModalError(null);
            }
          }}
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
  column: (typeof TASK_COLUMNS)[number];
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
          <h3 className="text-[13px] font-semibold text-gray-900 leading-snug">
            {task.title}
          </h3>
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
        <span className="font-medium text-gray-600 truncate">{task.projectName}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatTaskDueDate(task.dueDate)}
          </span>
          <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-700 text-[10px] font-bold flex items-center justify-center">
            {(task.assigneeName || "?").slice(0, 1)}
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
              <div className="text-[14px] font-medium text-gray-900 truncate">
                {task.title}
              </div>
              <div className="text-[12px] text-gray-400 mt-0.5 capitalize">
                {TASK_COLUMNS.find((c) => c.id === task.column)?.label}
              </div>
            </div>
            <div className="text-sm text-gray-500 truncate">{task.projectName}</div>
            <div>
              <span
                className={`text-[11px] font-semibold capitalize rounded-full px-2 py-0.5 ${PRIORITY_STYLES[task.priority]}`}
              >
                {task.priority}
              </span>
            </div>
            <div className="text-sm text-gray-500 inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {formatTaskDueDate(task.dueDate)}
            </div>
            <div className="text-sm text-gray-700 inline-flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-gray-400" />
              {task.assigneeName}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
