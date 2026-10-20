"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import {
  DEFAULT_HOURLY_RATE,
  clientDisplayName,
} from "@/lib/time-entries";

export type TimerClient = {
  id: string;
  name: string;
  company: string | null;
};

export type TimerProject = {
  id: string;
  name: string;
  clientId: string;
};

export type TimerTask = {
  id: string;
  title: string;
  clientId: string | null;
};

type TimeTrackingContextValue = {
  clients: TimerClient[];
  projects: TimerProject[];
  clientTasks: TimerTask[];
  selectedClient: TimerClient | null;
  setSelectedClient: (client: TimerClient | null) => void;
  selectedProject: TimerProject | null;
  setSelectedProject: (project: TimerProject | null) => void;
  selectedTask: TimerTask | null;
  setSelectedTask: (task: TimerTask | null) => void;
  workDescription: string;
  setWorkDescription: (value: string) => void;
  isTracking: boolean;
  elapsedSeconds: number;
  activeEntryId: string | null;
  startTimer: () => Promise<void>;
  stopTimer: (opts?: { description?: string }) => Promise<void>;
  canStart: boolean;
  busy: boolean;
  error: string | null;
  entriesVersion: number;
  defaultHourlyRate: number;
  refreshClients: () => Promise<void>;
};

const TimeTrackingContext = createContext<TimeTrackingContextValue | null>(null);

export function TimeTrackingProvider({ children }: { children: React.ReactNode }) {
  const {
    userId,
    organizationId,
    loading: profileLoading,
  } = useProfile();

  const [clients, setClients] = useState<TimerClient[]>([]);
  const [projects, setProjects] = useState<TimerProject[]>([]);
  const [selectedClient, setSelectedClientState] = useState<TimerClient | null>(
    null
  );
  const [selectedProject, setSelectedProject] = useState<TimerProject | null>(
    null
  );
  const [selectedTask, setSelectedTaskState] = useState<TimerTask | null>(null);
  const [clientTasks, setClientTasks] = useState<TimerTask[]>([]);
  const [workDescription, setWorkDescriptionState] = useState("");
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entriesVersion, setEntriesVersion] = useState(0);
  const [defaultHourlyRate, setDefaultHourlyRate] = useState(DEFAULT_HOURLY_RATE);
  const [hydrated, setHydrated] = useState(false);
  const actionLock = useRef(false);

  const isTracking = Boolean(activeEntryId && startedAtMs != null);

  const refreshClients = useCallback(async () => {
    if (!organizationId) {
      setClients([]);
      setProjects([]);
      setDefaultHourlyRate(DEFAULT_HOURLY_RATE);
      return;
    }

    const supabase = createClient();
    const [clientsRes, projectsRes, orgRes] = await Promise.all([
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
        .from("organizations")
        .select("default_hourly_rate")
        .eq("id", organizationId)
        .maybeSingle(),
    ]);

    if (!clientsRes.error) {
      setClients(
        (clientsRes.data ?? []).map((c) => ({
          id: c.id,
          name: clientDisplayName(c),
          company: c.company,
        }))
      );
    }
    if (!projectsRes.error) {
      setProjects(
        (projectsRes.data ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          clientId: p.client_id,
        }))
      );
    }
    const rate = Number(orgRes.data?.default_hourly_rate);
    setDefaultHourlyRate(
      Number.isFinite(rate) && rate >= 0 ? rate : DEFAULT_HOURLY_RATE
    );
  }, [organizationId]);

  const resumeRunning = useCallback(async () => {
    try {
      if (!organizationId || !userId) {
        setActiveEntryId(null);
        setStartedAtMs(null);
        setElapsedSeconds(0);
        return;
      }

      const supabase = createClient();
      const { data, error: resumeError } = await supabase
        .from("time_entries")
        .select(
          "id, description, started_at, client_id, project_id, task_id, clients(id, name, company), projects(id, name, client_id), tasks(id, title, client_id)"
        )
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .is("ended_at", null)
        .is("deleted_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (resumeError) {
        setError(resumeError.message);
        setActiveEntryId(null);
        setStartedAtMs(null);
        setElapsedSeconds(0);
        return;
      }

      if (!data) {
        setActiveEntryId(null);
        setStartedAtMs(null);
        setElapsedSeconds(0);
        return;
      }

      const clientRel = data.clients as
        | { id: string; name: string; company: string | null }
        | null
        | undefined;
      const projectRel = data.projects as
        | { id: string; name: string; client_id: string }
        | null
        | undefined;
      const taskRel = data.tasks as
        | { id: string; title: string; client_id: string | null }
        | null
        | undefined;

      if (clientRel) {
        setSelectedClientState({
          id: clientRel.id,
          name: clientDisplayName(clientRel),
          company: clientRel.company,
        });
      } else if (data.client_id) {
        setSelectedClientState({
          id: data.client_id,
          name: "Client",
          company: null,
        });
      }

      if (projectRel) {
        setSelectedProject({
          id: projectRel.id,
          name: projectRel.name,
          clientId: projectRel.client_id,
        });
      } else {
        setSelectedProject(null);
      }

      if (taskRel) {
        setSelectedTaskState({
          id: taskRel.id,
          title: taskRel.title || "Untitled",
          clientId: taskRel.client_id,
        });
      } else {
        setSelectedTaskState(null);
      }

      setWorkDescriptionState(data.description || "");
      setActiveEntryId(data.id);
      const startMs = new Date(data.started_at).getTime();
      setStartedAtMs(Number.isFinite(startMs) ? startMs : Date.now());
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - (Number.isFinite(startMs) ? startMs : Date.now())) / 1000))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resume timer.");
      setActiveEntryId(null);
      setStartedAtMs(null);
      setElapsedSeconds(0);
    } finally {
      setHydrated(true);
    }
  }, [organizationId, userId]);

  useEffect(() => {
    if (profileLoading) return;
    void refreshClients();
    void resumeRunning();
  }, [profileLoading, refreshClients, resumeRunning]);

  useEffect(() => {
    if (startedAtMs == null) return;
    const tick = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [startedAtMs]);

  function setSelectedClient(client: TimerClient | null) {
    setSelectedClientState(client);
    setSelectedProject((prev) =>
      prev && client && prev.clientId === client.id ? prev : null
    );
    setSelectedTaskState((prev) =>
      prev && client && prev.clientId === client.id ? prev : null
    );
    setError(null);
  }

  function setWorkDescription(value: string) {
    setWorkDescriptionState(value);
    setSelectedTaskState((prev) => {
      if (!prev) return null;
      return prev.title === value ? prev : null;
    });
  }

  function setSelectedTask(task: TimerTask | null) {
    setSelectedTaskState(task);
    if (task) setWorkDescriptionState(task.title);
  }

  useEffect(() => {
    if (!organizationId || !selectedClient?.id) {
      setClientTasks([]);
      return;
    }
    const orgId = organizationId;
    const clientId = selectedClient.id;
    let cancelled = false;
    async function loadClientTasks() {
      const supabase = createClient();
      const { data } = await supabase
        .from("tasks")
        .select("id, title, client_id")
        .eq("organization_id", orgId)
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(40);
      if (cancelled) return;
      setClientTasks(
        (data || []).map((t) => ({
          id: t.id,
          title: t.title || "Untitled",
          clientId: t.client_id,
        }))
      );
    }
    void loadClientTasks();
    return () => {
      cancelled = true;
    };
  }, [organizationId, selectedClient?.id]);

  const startTimer = useCallback(async () => {
    if (actionLock.current) return;

    if (!organizationId || !userId) {
      setError("Workspace isn’t ready yet. Refresh and try again.");
      return;
    }

    actionLock.current = true;
    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();
      const nowIso = new Date().toISOString();

      // Close any leftover running timers for this user.
      // duration_minutes is GENERATED ALWAYS from started_at/ended_at
      const { data: openRows } = await supabase
        .from("time_entries")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .is("ended_at", null)
        .is("deleted_at", null);

      for (const row of openRows ?? []) {
        await supabase
          .from("time_entries")
          .update({ ended_at: nowIso })
          .eq("id", row.id);
      }

      const projectId =
        selectedClient &&
        selectedProject &&
        selectedProject.clientId === selectedClient.id
          ? selectedProject.id
          : null;

      const taskId =
        selectedTask &&
        selectedClient &&
        selectedTask.clientId === selectedClient.id
          ? selectedTask.id
          : null;

      const { data, error: insertError } = await supabase
        .from("time_entries")
        .insert({
          organization_id: organizationId,
          user_id: userId,
          client_id: selectedClient?.id ?? null,
          project_id: projectId,
          task_id: taskId,
          description: workDescription.trim() || null,
          started_at: nowIso,
          ended_at: null,
          billable: true,
          hourly_rate: defaultHourlyRate,
        })
        .select("id, started_at")
        .single();

      if (insertError || !data) {
        setError(insertError?.message || "Could not start timer.");
        return;
      }

      setActiveEntryId(data.id);
      const startMs = new Date(data.started_at).getTime();
      setStartedAtMs(Number.isFinite(startMs) ? startMs : Date.now());
      setElapsedSeconds(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start timer.");
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }, [
    organizationId,
    userId,
    selectedClient,
    selectedProject,
    selectedTask,
    workDescription,
    defaultHourlyRate,
  ]);

  const stopTimer = useCallback(
    async (opts?: { description?: string }) => {
      if (actionLock.current) return;
      if (!organizationId || !userId || !activeEntryId || startedAtMs == null) {
        setError("No active timer to stop.");
        return;
      }

      const description =
        (opts?.description !== undefined
          ? opts.description
          : workDescription
        ).trim() || null;

      actionLock.current = true;
      setBusy(true);
      setError(null);

      try {
        const supabase = createClient();
        const endedAt = new Date().toISOString();

        const taskId =
          selectedTask &&
          selectedClient &&
          selectedTask.clientId === selectedClient.id
            ? selectedTask.id
            : null;

        const { error: updateError } = await supabase
          .from("time_entries")
          .update({
            // duration_minutes is GENERATED ALWAYS from started_at/ended_at
            ended_at: endedAt,
            description,
            client_id: selectedClient?.id ?? null,
            project_id:
              selectedProject &&
              selectedClient &&
              selectedProject.clientId === selectedClient.id
                ? selectedProject.id
                : null,
            task_id: taskId,
          })
          .eq("id", activeEntryId)
          .eq("organization_id", organizationId)
          .eq("user_id", userId);

        if (updateError) {
          setError(updateError.message);
          return;
        }

        setActiveEntryId(null);
        setStartedAtMs(null);
        setElapsedSeconds(0);
        setWorkDescriptionState("");
        setSelectedTaskState(null);
        setEntriesVersion((v) => v + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not stop timer.");
      } finally {
        actionLock.current = false;
        setBusy(false);
      }
    },
    [
      organizationId,
      userId,
      activeEntryId,
      startedAtMs,
      workDescription,
      selectedClient,
      selectedProject,
      selectedTask,
    ]
  );

  const canStart = Boolean(hydrated && organizationId && userId && !busy);

  const value = useMemo(
    () => ({
      clients,
      projects,
      clientTasks,
      selectedClient,
      setSelectedClient,
      selectedProject,
      setSelectedProject,
      selectedTask,
      setSelectedTask,
      workDescription,
      setWorkDescription,
      isTracking,
      elapsedSeconds,
      activeEntryId,
      startTimer,
      stopTimer,
      canStart,
      busy,
      error,
      entriesVersion,
      defaultHourlyRate,
      refreshClients,
    }),
    [
      clients,
      projects,
      clientTasks,
      selectedClient,
      selectedProject,
      selectedTask,
      workDescription,
      isTracking,
      elapsedSeconds,
      activeEntryId,
      startTimer,
      stopTimer,
      canStart,
      busy,
      error,
      entriesVersion,
      defaultHourlyRate,
      refreshClients,
    ]
  );

  return (
    <TimeTrackingContext.Provider value={value}>
      {children}
    </TimeTrackingContext.Provider>
  );
}

export function useTimeTracking() {
  const ctx = useContext(TimeTrackingContext);
  if (!ctx) {
    throw new Error("useTimeTracking must be used within TimeTrackingProvider");
  }
  return ctx;
}

export function formatElapsed(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}
