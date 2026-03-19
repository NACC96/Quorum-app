"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { DeliberationSession } from "@/lib/types";

interface DeliberationContextValue {
  deliberations: DeliberationSession[];
  addDeliberation: (session: DeliberationSession) => void;
  updateDeliberation: (session: DeliberationSession) => void;
  patchDeliberation: (id: string, patcher: (session: DeliberationSession) => DeliberationSession) => void;
  removeDeliberation: (id: string) => void;
  getDeliberation: (id: string) => DeliberationSession | undefined;
}

const DeliberationContext = createContext<DeliberationContextValue | null>(null);

function upsertLocal(prev: DeliberationSession[], incoming: DeliberationSession): DeliberationSession[] {
  const idx = prev.findIndex((s) => s.id === incoming.id);
  if (idx === -1) return [incoming, ...prev];
  const next = [...prev];
  next[idx] = incoming;
  return next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function DeliberationProvider({ children }: { children: React.ReactNode }) {
  const [deliberations, setDeliberations] = useState<DeliberationSession[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    fetch("/api/deliberations")
      .then((r) => r.json())
      .then((data: DeliberationSession[]) => setDeliberations(data))
      .catch(console.error);
  }, []);

  const persist = useCallback((session: DeliberationSession) => {
    fetch("/api/deliberations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    }).catch(console.error);
  }, []);

  const addDeliberation = useCallback(
    (session: DeliberationSession) => {
      setDeliberations((prev) => upsertLocal(prev, session));
      persist(session);
    },
    [persist]
  );

  const updateDeliberation = useCallback(
    (session: DeliberationSession) => {
      setDeliberations((prev) => upsertLocal(prev, session));
      persist(session);
    },
    [persist]
  );

  const patchDeliberation = useCallback(
    (id: string, patcher: (session: DeliberationSession) => DeliberationSession) => {
      setDeliberations((prev) => {
        const existing = prev.find((s) => s.id === id);
        if (!existing) return prev;
        const patched = patcher(existing);
        persist(patched);
        return upsertLocal(prev, patched);
      });
    },
    [persist]
  );

  const removeDeliberation = useCallback((id: string) => {
    setDeliberations((prev) => prev.filter((s) => s.id !== id));
    fetch(`/api/deliberations/${id}`, { method: "DELETE" }).catch(console.error);
  }, []);

  const getDeliberation = useCallback(
    (id: string) => deliberations.find((s) => s.id === id),
    [deliberations]
  );

  return (
    <DeliberationContext.Provider
      value={{
        deliberations,
        addDeliberation,
        updateDeliberation,
        patchDeliberation,
        removeDeliberation,
        getDeliberation
      }}
    >
      {children}
    </DeliberationContext.Provider>
  );
}

export function useDeliberationContext(): DeliberationContextValue {
  const ctx = useContext(DeliberationContext);
  if (!ctx) {
    throw new Error("useDeliberationContext must be used within a DeliberationProvider");
  }
  return ctx;
}
