"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Session } from "@/lib/types";

interface SessionsContextValue {
  sessions: Session[];
  addSession: (session: Session) => void;
  updateSession: (session: Session) => void;
  patchSession: (id: string, patcher: (session: Session) => Session) => void;
  removeSession: (id: string) => void;
  getSession: (id: string) => Session | undefined;
}

const SessionsContext = createContext<SessionsContextValue | null>(null);

function upsertLocal(prev: Session[], incoming: Session): Session[] {
  const idx = prev.findIndex((s) => s.id === incoming.id);
  if (idx === -1) return [incoming, ...prev];
  const next = [...prev];
  next[idx] = incoming;
  return next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function SessionsProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: Session[]) => setSessions(data))
      .catch(console.error);
  }, []);

  const persist = useCallback((session: Session) => {
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    }).catch(console.error);
  }, []);

  const addSession = useCallback(
    (session: Session) => {
      setSessions((prev) => upsertLocal(prev, session));
      persist(session);
    },
    [persist]
  );

  const updateSession = useCallback(
    (session: Session) => {
      setSessions((prev) => upsertLocal(prev, session));
      persist(session);
    },
    [persist]
  );

  const patchSession = useCallback(
    (id: string, patcher: (session: Session) => Session) => {
      setSessions((prev) => {
        const existing = prev.find((s) => s.id === id);
        if (!existing) return prev;
        const patched = patcher(existing);
        persist(patched);
        return upsertLocal(prev, patched);
      });
    },
    [persist]
  );

  const removeSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    fetch(`/api/sessions/${id}`, { method: "DELETE" }).catch(console.error);
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
