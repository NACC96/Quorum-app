"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DeliberationSession } from "@/lib/types";
import {
  deleteDeliberation,
  loadDeliberations,
  saveDeliberations,
  upsertDeliberation
} from "@/lib/deliberation-storage";

interface DeliberationContextValue {
  deliberations: DeliberationSession[];
  addDeliberation: (session: DeliberationSession) => void;
  updateDeliberation: (session: DeliberationSession) => void;
  patchDeliberation: (id: string, patcher: (session: DeliberationSession) => DeliberationSession) => void;
  removeDeliberation: (id: string) => void;
  getDeliberation: (id: string) => DeliberationSession | undefined;
}

const DeliberationContext = createContext<DeliberationContextValue | null>(null);

export function DeliberationProvider({ children }: { children: React.ReactNode }) {
  const [deliberations, setDeliberations] = useState<DeliberationSession[]>([]);

  useEffect(() => {
    setDeliberations(loadDeliberations());
  }, []);

  useEffect(() => {
    if (deliberations.length > 0 || loadDeliberations().length > 0) {
      saveDeliberations(deliberations);
    }
  }, [deliberations]);

  const addDeliberation = useCallback((session: DeliberationSession) => {
    setDeliberations((prev) => upsertDeliberation(prev, session));
  }, []);

  const updateDeliberation = useCallback((session: DeliberationSession) => {
    setDeliberations((prev) => upsertDeliberation(prev, session));
  }, []);

  const patchDeliberation = useCallback(
    (id: string, patcher: (session: DeliberationSession) => DeliberationSession) => {
      setDeliberations((prev) => {
        const existing = prev.find((s) => s.id === id);
        if (!existing) return prev;
        return upsertDeliberation(prev, patcher(existing));
      });
    },
    []
  );

  const removeDeliberation = useCallback((id: string) => {
    setDeliberations((prev) => deleteDeliberation(prev, id));
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
