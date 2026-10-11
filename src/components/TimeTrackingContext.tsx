"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export type TimerClient = {
  name: string;
  company?: string;
};

type TimeTrackingContextValue = {
  selectedClient: TimerClient | null;
  setSelectedClient: (client: TimerClient | null) => void;
  workDescription: string;
  setWorkDescription: (value: string) => void;
  isTracking: boolean;
  elapsedSeconds: number;
  startTimer: () => void;
  stopTimer: () => void;
  canStart: boolean;
};

const TimeTrackingContext = createContext<TimeTrackingContextValue | null>(null);

export function TimeTrackingProvider({ children }: { children: React.ReactNode }) {
  const [selectedClient, setSelectedClient] = useState<TimerClient | null>(null);
  const [workDescription, setWorkDescription] = useState("");
  const [isTracking, setIsTracking] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isTracking) return;
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isTracking]);

  const startTimer = useCallback(() => {
    if (!selectedClient || !workDescription.trim()) return;
    setIsTracking(true);
  }, [selectedClient, workDescription]);

  const stopTimer = useCallback(() => {
    setIsTracking(false);
    setElapsedSeconds(0);
    setWorkDescription("");
  }, []);

  const canStart = Boolean(selectedClient && workDescription.trim());

  return (
    <TimeTrackingContext.Provider
      value={{
        selectedClient,
        setSelectedClient,
        workDescription,
        setWorkDescription,
        isTracking,
        elapsedSeconds,
        startTimer,
        stopTimer,
        canStart,
      }}
    >
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

export const TIMER_CLIENTS: TimerClient[] = [
  { name: "Acme Studio", company: "Acme Corp" },
  { name: "Globex Inc", company: "Globex LLC" },
  { name: "Stark Industries", company: "Stark Inc" },
];
