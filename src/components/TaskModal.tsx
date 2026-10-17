"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  ImagePlus,
  FileText,
  Film,
  Paperclip,
  Trash2,
  Send,
  MessageSquare,
} from "lucide-react";
import {
  TASK_COLUMNS,
  type TaskPriority,
  type UiTaskColumn,
} from "@/lib/tasks";
import {
  ModalOverlay,
  modalHeaderClass,
  modalPanelClass,
} from "@/components/ModalFrame";

export type TaskColumnId = UiTaskColumn;
export type { TaskPriority };

export type TaskMedia = {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  storagePath?: string;
  file?: File;
  isNew?: boolean;
};

export type TaskComment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  authorId?: string;
  isNew?: boolean;
};

export type TaskFormValues = {
  title: string;
  description: string;
  column: TaskColumnId;
  clientId: string;
  projectId: string;
  newProjectName: string;
  priority: TaskPriority;
  dueDate: string;
  assigneeId: string;
  media: TaskMedia[];
  comments: TaskComment[];
};

export type TaskOption = { id: string; name: string };
export type TaskProjectOption = { id: string; name: string; clientId: string };
export type TaskMemberOption = { id: string; name: string };

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

const inputClass =
  "w-full border border-line rounded-xl px-3.5 py-2.5 text-sm text-gray-900 bg-white outline-none focus:border-gray-300 placeholder:text-gray-400";

type TaskModalProps = {
  mode: "create" | "edit";
  initialValues: TaskFormValues;
  clients: TaskOption[];
  projects: TaskProjectOption[];
  members: TaskMemberOption[];
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (values: TaskFormValues) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mediaIcon(type: string) {
  if (type.startsWith("image/")) return ImagePlus;
  if (type.startsWith("video/")) return Film;
  return FileText;
}

export function TaskModal({
  mode,
  initialValues,
  clients,
  projects,
  members,
  busy = false,
  error = null,
  onClose,
  onSave,
  onDelete,
}: TaskModalProps) {
  const [values, setValues] = useState<TaskFormValues>(initialValues);
  const [commentDraft, setCommentDraft] = useState("");
  const [dragging, setDragging] = useState(false);
  const [creatingProject, setCreatingProject] = useState(
    Boolean(initialValues.newProjectName)
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValues(initialValues);
    setCommentDraft("");
    setCreatingProject(Boolean(initialValues.newProjectName));
  }, [initialValues]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const filteredProjects = useMemo(
    () =>
      values.clientId
        ? projects.filter((project) => project.clientId === values.clientId)
        : projects,
    [projects, values.clientId]
  );

  function update<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const next: TaskMedia[] = Array.from(fileList).map((file) => ({
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      url: URL.createObjectURL(file),
      file,
      isNew: true,
    }));
    update("media", [...values.media, ...next]);
  }

  function removeMedia(id: string) {
    const item = values.media.find((m) => m.id === id);
    if (item?.url.startsWith("blob:")) URL.revokeObjectURL(item.url);
    update(
      "media",
      values.media.filter((m) => m.id !== id)
    );
  }

  function addComment() {
    const body = commentDraft.trim();
    if (!body) return;
    const me = members.find((m) => m.id === values.assigneeId) || members[0];
    const comment: TaskComment = {
      id: `c-${Date.now()}`,
      author: me?.name || "You",
      authorId: me?.id,
      body,
      createdAt: "Just now",
      isNew: true,
    };
    update("comments", [...values.comments, comment]);
    setCommentDraft("");
  }

  function removeComment(id: string) {
    update(
      "comments",
      values.comments.filter((c) => c.id !== id)
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.title.trim() || busy) return;
    await onSave({
      ...values,
      title: values.title.trim(),
      description: values.description.trim(),
      newProjectName: creatingProject ? values.newProjectName.trim() : "",
      projectId: creatingProject ? "" : values.projectId,
    });
  }

  return (
    <ModalOverlay onClose={busy ? undefined : onClose}>
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className={modalPanelClass("max-w-[640px]")}
      >
        <div className={modalHeaderClass}>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
              {mode === "create" ? "New task" : "Edit task"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {mode === "create"
                ? "Add work, attach files, and leave notes."
                : "Update details, media, or comments."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 sm:px-6 pb-2 space-y-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0 no-scrollbar">
          {error && (
            <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
              {error}
            </p>
          )}

          <Field label="Title">
            <input
              autoFocus
              value={values.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="What needs to get done?"
              className={inputClass}
            />
          </Field>

          <Field label="Description">
            <textarea
              value={values.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Optional context, links, or notes..."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Client">
              <select
                value={values.clientId}
                onChange={(e) => {
                  const clientId = e.target.value;
                  setValues((prev) => ({
                    ...prev,
                    clientId,
                    projectId:
                      prev.projectId &&
                      projects.some(
                        (p) => p.id === prev.projectId && p.clientId === clientId
                      )
                        ? prev.projectId
                        : "",
                  }));
                }}
                className={inputClass}
              >
                <option value="">No client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project">
              {creatingProject ? (
                <div className="space-y-2">
                  <input
                    value={values.newProjectName}
                    onChange={(e) => update("newProjectName", e.target.value)}
                    placeholder="New project name"
                    className={inputClass}
                    disabled={!values.clientId}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingProject(false);
                      update("newProjectName", "");
                    }}
                    className="text-[12px] font-medium text-[#2563EB]"
                  >
                    Choose existing project
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <select
                    value={values.projectId}
                    onChange={(e) => {
                      const projectId = e.target.value;
                      const project = projects.find((p) => p.id === projectId);
                      setValues((prev) => ({
                        ...prev,
                        projectId,
                        clientId: project?.clientId || prev.clientId,
                      }));
                    }}
                    className={inputClass}
                  >
                    <option value="">No project</option>
                    {filteredProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  {values.clientId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingProject(true);
                        update("projectId", "");
                      }}
                      className="text-[12px] font-medium text-[#2563EB]"
                    >
                      + Create new project
                    </button>
                  ) : (
                    <p className="text-[12px] text-gray-400">
                      Select a client to create a project.
                    </p>
                  )}
                </div>
              )}
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Status">
              <select
                value={values.column}
                onChange={(e) => update("column", e.target.value as TaskColumnId)}
                className={inputClass}
              >
                {TASK_COLUMNS.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select
                value={values.priority}
                onChange={(e) => update("priority", e.target.value as TaskPriority)}
                className={`${inputClass} capitalize`}
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Due date">
              <input
                type="date"
                value={values.dueDate}
                onChange={(e) => update("dueDate", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Assignee">
              <select
                value={values.assigneeId}
                onChange={(e) => update("assigneeId", e.target.value)}
                className={inputClass}
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[13px] font-medium text-gray-700">Media</span>
              <span className="text-[12px] text-gray-400">
                {values.media.length} {values.media.length === 1 ? "file" : "files"}
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip"
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={`w-full rounded-2xl border border-dashed px-4 py-5 flex flex-col items-center justify-center gap-1.5 transition-colors ${
                dragging
                  ? "border-[#2563EB] bg-[#EFF6FF]"
                  : "border-line bg-[#FAFBFC] hover:border-gray-300 hover:bg-white"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  dragging ? "bg-[#DBEAFE] text-[#2563EB]" : "bg-white border border-line text-gray-500"
                }`}
              >
                <Paperclip className="w-4 h-4" />
              </div>
              <p className="text-[13px] font-medium text-gray-800">
                Drop files here or click to upload
              </p>
              <p className="text-[12px] text-gray-400">Images, video, PDF, or docs</p>
            </button>

            {values.media.length > 0 && (
              <ul className="mt-3 space-y-2">
                {values.media.map((item) => {
                  const Icon = mediaIcon(item.type);
                  const isImage = item.type.startsWith("image/");
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5"
                    >
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.url}
                          alt={item.name}
                          className="w-10 h-10 rounded-lg object-cover border border-line shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#FAFBFC] border border-line flex items-center justify-center shrink-0 text-gray-500">
                          <Icon className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-gray-900 truncate">
                          {item.name}
                        </div>
                        <div className="text-[12px] text-gray-400">{formatBytes(item.size)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeMedia(item.id)}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[13px] font-medium text-gray-700 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                Comments
              </span>
              <span className="text-[12px] text-gray-400">
                {values.comments.length}
              </span>
            </div>

            {values.comments.length > 0 ? (
              <ul className="space-y-2 mb-3">
                {values.comments.map((comment) => (
                  <li
                    key={comment.id}
                    className="rounded-xl border border-line bg-[#FAFBFC] px-3.5 py-3 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-[#2563EB] text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
                          {comment.author.slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[13px] font-semibold text-gray-900">
                              {comment.author}
                            </span>
                            <span className="text-[11px] text-gray-400">{comment.createdAt}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeComment(comment.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all"
                        title="Remove comment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-[13px] text-gray-700 leading-relaxed mt-2 pl-9">
                      {comment.body}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-gray-400 mb-3 px-0.5">
                No comments yet. Add the first note below.
              </p>
            )}

            <div className="flex items-end gap-2">
              <textarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    addComment();
                  }
                }}
                placeholder="Write a comment…"
                rows={2}
                className={`${inputClass} resize-none`}
              />
              <button
                type="button"
                onClick={addComment}
                disabled={!commentDraft.trim()}
                className="btn-primary h-10 w-10 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40"
                title="Add comment"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-line flex items-center justify-between gap-3 bg-[#FAFBFC] shrink-0">
          {mode === "edit" && onDelete ? (
            <button
              type="button"
              onClick={() => void onDelete()}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!values.title.trim() || busy}
              className="btn-primary px-5 py-2.5 rounded-xl text-sm disabled:opacity-50"
            >
              {busy
                ? "Saving…"
                : mode === "create"
                  ? "Create task"
                  : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </ModalOverlay>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-gray-700 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
