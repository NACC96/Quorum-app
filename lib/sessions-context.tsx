"use client";

import { GenericProvider, useGenericContext } from "./generic-context";
import type { Session } from "@/lib/types";

export function SessionsProvider({ children }: { children: React.ReactNode }) {
  return (
    <GenericProvider<Session, "id"> apiEndpoint="/api/sessions" idKey="id">
      {children}
    </GenericProvider>
  );
}

export function useSessionsContext() {
  const ctx = useGenericContext<Session>();
  return {
    sessions: ctx.items,
    loading: ctx.loading,
    error: ctx.error,
    addSession: ctx.addItem,
    updateSession: ctx.updateItem,
    patchSession: ctx.patchItem,
    removeSession: ctx.removeItem,
    getSession: ctx.getItem,
  };
}
