"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Session } from "@/lib/types";
import { deleteSession, loadSessions, saveSessions, upsertSession } from "@/lib/storage";

interface SessionsContextValue {
  sessions: Session[];
  addSession: (session: Session) => void;
  updateSession: (session: Session) => void;
  patchSession: (id: string, patcher: (session: Session) => Session) => void;
  removeSession: (id: string) => void;
  getSession: (id: string) => Session | undefined;
}

const SessionsContext = createContext<SessionsContextValue | null>(null);

export function SessionsProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    setSessions(loadSessions());
  }, []);

  useEffect(() => {
    if (sessions.length > 0 || loadSessions().length > 0) {
      saveSessions(sessions);
    }
  }, [sessions]);

  const addSession = useCallback((session: Session) => {
    setSessions((prev) => upsertSession(prev, session));
  }, []);

  const updateSession = useCallback((session: Session) => {
    setSessions((prev) => upsertSession(prev, session));
  }, []);

  const patchSession = useCallback((id: string, patcher: (session: Session) => Session) => {
    setSessions((prev) => {
      const existing = prev.find((s) => s.id === id);
      if (!existing) return prev;
      return upsertSession(prev, patcher(existing));
    });
  }, []);

  const removeSession = useCallback((id: string) => {
    setSessions((prev) => deleteSession(prev, id));
  }, []);

  const getSession = useCallback(
    (id: string) => sessions.find((s) => s.id === id),
    [sessions]
  );

  return (
    <SessionsContext.Provider
      value={{ sessions, addSession, updateSession, patchSession, removeSession, getSession }}
    >
      {children}
    </SessionsContext.Provider>
  );
}

export function useSessionsContext(): SessionsContextValue {
  const ctx = useContext(SessionsContext);
  if (!ctx) {
    throw new Error("useSessionsContext must be used within a SessionsProvider");
  }
  return ctx;
}
