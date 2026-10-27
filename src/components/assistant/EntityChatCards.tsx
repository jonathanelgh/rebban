"use client";

import React, { useCallback, useEffect, useState } from "react";
import type {
  AssistantChatComponent,
  ChatComponentAction,
  ClientChatComponent,
  LeadChatComponent,
  ProjectChatComponent,
  ProposalChatComponent,
  TaskChatComponent,
  TimeSummaryChatComponent,
} from "@/lib/assistant/components";
import {
  CardBtn,
  ChatCardShell,
  MetaRow,
  formatShortDate,
} from "@/components/assistant/chat-card-shared";

type CommonProps = {
  conversationId?: string | null;
  onError?: (message: string) => void;
  onUpdated?: (next: AssistantChatComponent | null) => void;
};

async function fetchCard(kind: string, id: string) {
  const res = await fetch(`/api/assistant/cards/${kind}/${id}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Could not load card.");
  return json.component as AssistantChatComponent;
}

async function runEntityAction(options: {
  kind: string;
  action: string;
  entityId: string;
  conversationId?: string | null;
}) {
  const res = await fetch("/api/assistant/actions/entity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Action failed.");
  return json as {
    component?: AssistantChatComponent | null;
    clientComponent?: AssistantChatComponent | null;
    projectComponent?: AssistantChatComponent | null;
  };
}

function useLiveCard<T extends AssistantChatComponent>(
  kind: string,
  initial: T,
  onError?: (message: string) => void
) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = (await fetchCard(kind, initial.entityId)) as T;
      setData(next);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not load card.";
      setError(message);
      onError?.(message);
    } finally {
      setLoading(false);
    }
  }, [kind, initial.entityId, onError]);

  useEffect(() => {
    setData(initial);
    void refresh();
  }, [initial.entityId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, setData, loading, acting, setActing, error, setError, refresh };
}

export function ProposalChatCard({
  component,
  conversationId,
  onError,
  onUpdated,
}: CommonProps & { component: ProposalChatComponent }) {
  const { data, setData, loading, acting, setActing, error, setError, refresh } =
    useLiveCard("proposal", component, onError);
  const snap = data.snapshot || {};
  const actions = data.actions || [];

  async function act(action: ChatComponentAction) {
    setActing(action);
    setError(null);
    try {
      const json = await runEntityAction({
        kind: "proposal",
        action,
        entityId: data.entityId,
        conversationId,
      });
      if (json.component) {
        setData(json.component as ProposalChatComponent);
        onUpdated?.(json.component);
      } else await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed.";
      setError(message);
      onError?.(message);
    } finally {
      setActing(null);
    }
  }

  return (
    <ChatCardShell
      title={snap.title || "Proposal"}
      subtitle={snap.client || "Client"}
      status={snap.status || "draft"}
      actions={
        <>
          {actions.includes("approve_and_send") ? (
            <CardBtn
              primary
              disabled={Boolean(acting)}
              onClick={() => void act("approve_and_send")}
            >
              {acting === "approve_and_send" ? "Sending…" : "Approve & Send"}
            </CardBtn>
          ) : null}
          {actions.includes("convert_to_project") ? (
            <CardBtn
              primary
              disabled={Boolean(acting)}
              onClick={() => void act("convert_to_project")}
            >
              {acting === "convert_to_project"
                ? "Converting…"
                : "Convert to Project"}
            </CardBtn>
          ) : null}
          {actions.includes("edit") || actions.includes("view") ? (
            <CardBtn href={`/proposals/${data.entityId}/edit`}>
              {actions.includes("edit") ? "Edit Proposal" : "View Proposal"}
            </CardBtn>
          ) : null}
          {actions.includes("preview") ? (
            <CardBtn href={`/proposals/${data.entityId}/edit`}>Preview</CardBtn>
          ) : null}
        </>
      }
    >
      {loading && !snap.amount ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <>
          <MetaRow label="Value" value={snap.amount || "—"} bold />
          {snap.expiresAt ? (
            <MetaRow label="Expires" value={formatShortDate(snap.expiresAt)} />
          ) : null}
          {snap.summary ? (
            <p className="line-clamp-2 pt-1 text-[12px] text-gray-600">
              {snap.summary}
            </p>
          ) : null}
        </>
      )}
      {error ? (
        <p className="text-[12px] text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </ChatCardShell>
  );
}

export function ClientChatCard({
  component,
  onError,
}: CommonProps & { component: ClientChatComponent }) {
  const { data, loading, error } = useLiveCard("client", component, onError);
  const snap = data.snapshot || {};
  const actions = data.actions || [];
  const label = snap.company || snap.name || "Client";

  return (
    <ChatCardShell
      title={label}
      subtitle={snap.email || snap.phone || null}
      status={snap.status || "active"}
      actions={
        <>
          {actions.includes("view") || actions.includes("edit") ? (
            <CardBtn href={`/clients/${data.entityId}`}>
              {actions.includes("edit") ? "Edit Client" : "View Client"}
            </CardBtn>
          ) : null}
          {actions.includes("create_proposal") ? (
            <CardBtn href="/proposals">Create Proposal</CardBtn>
          ) : null}
          {actions.includes("create_invoice") ? (
            <CardBtn href="/invoices">Create Invoice</CardBtn>
          ) : null}
          {actions.includes("create_project") ? (
            <CardBtn href="/tasks">Create Project</CardBtn>
          ) : null}
        </>
      }
    >
      {loading && !snap.name ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <>
          {snap.company && snap.name ? (
            <MetaRow label="Contact" value={snap.name} />
          ) : null}
          {snap.email ? <MetaRow label="Email" value={snap.email} /> : null}
          {snap.phone ? <MetaRow label="Phone" value={snap.phone} /> : null}
        </>
      )}
      {error ? (
        <p className="text-[12px] text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </ChatCardShell>
  );
}

export function LeadChatCard({
  component,
  conversationId,
  onError,
  onUpdated,
}: CommonProps & { component: LeadChatComponent }) {
  const { data, setData, loading, acting, setActing, error, setError, refresh } =
    useLiveCard("lead", component, onError);
  const snap = data.snapshot || {};
  const actions = data.actions || [];

  async function convert() {
    setActing("convert_to_client");
    setError(null);
    try {
      const json = await runEntityAction({
        kind: "lead",
        action: "convert_to_client",
        entityId: data.entityId,
        conversationId,
      });
      if (json.component) {
        setData(json.component as LeadChatComponent);
        onUpdated?.(json.component);
      } else await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed.";
      setError(message);
      onError?.(message);
    } finally {
      setActing(null);
    }
  }

  return (
    <ChatCardShell
      title={snap.name || "Lead"}
      subtitle={snap.company || snap.email || null}
      status={snap.status || "new"}
      actions={
        <>
          {actions.includes("convert_to_client") ? (
            <CardBtn
              primary
              disabled={Boolean(acting)}
              onClick={() => void convert()}
            >
              {acting === "convert_to_client"
                ? "Converting…"
                : "Convert to Client"}
            </CardBtn>
          ) : null}
          {actions.includes("view") || actions.includes("edit") ? (
            <CardBtn href="/leads">
              {actions.includes("edit") ? "Edit Lead" : "View Lead"}
            </CardBtn>
          ) : null}
          {actions.includes("create_follow_up") ? (
            <CardBtn href="/tasks">Create Follow-up Task</CardBtn>
          ) : null}
        </>
      }
    >
      {loading && !snap.name ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <>
          {snap.email ? <MetaRow label="Email" value={snap.email} /> : null}
          {snap.phone ? <MetaRow label="Phone" value={snap.phone} /> : null}
          {snap.notes ? (
            <p className="line-clamp-2 pt-1 text-[12px] text-gray-600">
              {snap.notes}
            </p>
          ) : null}
        </>
      )}
      {error ? (
        <p className="text-[12px] text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </ChatCardShell>
  );
}

export function ProjectChatCard({
  component,
  conversationId,
  onError,
  onUpdated,
}: CommonProps & { component: ProjectChatComponent }) {
  const { data, setData, loading, acting, setActing, error, setError, refresh } =
    useLiveCard("project", component, onError);
  const snap = data.snapshot || {};
  const actions = data.actions || [];

  async function complete() {
    setActing("mark_complete");
    setError(null);
    try {
      const json = await runEntityAction({
        kind: "project",
        action: "mark_complete",
        entityId: data.entityId,
        conversationId,
      });
      if (json.component) {
        setData(json.component as ProjectChatComponent);
        onUpdated?.(json.component);
      } else await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed.";
      setError(message);
      onError?.(message);
    } finally {
      setActing(null);
    }
  }

  return (
    <ChatCardShell
      title={snap.name || "Project"}
      subtitle={snap.client || null}
      status={snap.status || "active"}
      actions={
        <>
          {actions.includes("view") ? (
            <CardBtn href="/tasks">View Project</CardBtn>
          ) : null}
          {actions.includes("add_task") ? (
            <CardBtn href="/tasks">Add Task</CardBtn>
          ) : null}
          {actions.includes("log_time") ? (
            <CardBtn href="/time-tracking">Log Time</CardBtn>
          ) : null}
          {actions.includes("mark_complete") ? (
            <CardBtn
              primary
              disabled={Boolean(acting)}
              onClick={() => void complete()}
            >
              {acting === "mark_complete" ? "Updating…" : "Mark Complete"}
            </CardBtn>
          ) : null}
        </>
      }
    >
      {loading && !snap.name ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <>
          <MetaRow
            label="Tasks"
            value={`${snap.tasksDone ?? 0} done · ${snap.tasksOpen ?? 0} open`}
          />
          <MetaRow label="Tracked" value={snap.trackedHours || "0h"} />
        </>
      )}
      {error ? (
        <p className="text-[12px] text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </ChatCardShell>
  );
}

export function TaskChatCard({
  component,
  conversationId,
  onError,
  onUpdated,
}: CommonProps & { component: TaskChatComponent }) {
  const { data, setData, loading, acting, setActing, error, setError, refresh } =
    useLiveCard("task", component, onError);
  const snap = data.snapshot || {};
  const actions = data.actions || [];

  async function complete() {
    setActing("mark_complete");
    setError(null);
    try {
      const json = await runEntityAction({
        kind: "task",
        action: "mark_complete",
        entityId: data.entityId,
        conversationId,
      });
      if (json.component) {
        setData(json.component as TaskChatComponent);
        onUpdated?.(json.component);
      } else await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed.";
      setError(message);
      onError?.(message);
    } finally {
      setActing(null);
    }
  }

  return (
    <ChatCardShell
      title={snap.title || "Task"}
      subtitle={snap.project || snap.client || null}
      status={snap.status || "todo"}
      actions={
        <>
          {actions.includes("mark_complete") ? (
            <CardBtn
              primary
              disabled={Boolean(acting)}
              onClick={() => void complete()}
            >
              {acting === "mark_complete" ? "Updating…" : "Mark Complete"}
            </CardBtn>
          ) : null}
          {actions.includes("edit") || actions.includes("view") ? (
            <CardBtn href="/tasks">
              {actions.includes("edit") ? "Edit Task" : "View Project"}
            </CardBtn>
          ) : null}
        </>
      }
    >
      {loading && !snap.title ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <>
          <MetaRow label="Due" value={formatShortDate(snap.dueDate)} />
          {snap.priority ? (
            <MetaRow label="Priority" value={snap.priority} />
          ) : null}
        </>
      )}
      {error ? (
        <p className="text-[12px] text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </ChatCardShell>
  );
}

export function TimeSummaryChatCard({
  component,
}: {
  component: TimeSummaryChatComponent;
}) {
  const clients = component.clients || [];
  return (
    <ChatCardShell
      title="Unbilled hours"
      subtitle={
        component.totalHours
          ? `${component.totalHours}${
              component.totalAmount ? ` · ${component.totalAmount}` : ""
            }`
          : null
      }
      actions={<CardBtn href="/invoices">Create Invoice</CardBtn>}
    >
      {clients.length === 0 ? (
        <p className="text-gray-500">No unbilled hours.</p>
      ) : (
        <ul className="space-y-1.5">
          {clients.map((c, i) => (
            <li
              key={`${c.clientId || c.client}-${i}`}
              className="flex items-baseline justify-between gap-2"
            >
              <span className="truncate text-gray-800">{c.client}</span>
              <span className="shrink-0 font-medium text-gray-900">
                {c.hours}
                {c.amount ? ` · ${c.amount}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ChatCardShell>
  );
}
