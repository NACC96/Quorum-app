"use client";

import { createGenericContext } from "./generic-context";
import type { Session } from "@/lib/types";

const { Provider: GenericSessionsProvider, useGenericContext: useGenericSessionsContext } =
  createGenericContext<Session>();

export function SessionsProvider({ children }: { children: React.ReactNode }) {
  return (
    <GenericSessionsProvider apiEndpoint="/api/sessions" idKey="id">
      {children}
    </GenericSessionsProvider>
  );
}

export function useSessionsContext() {
  const ctx = useGenericSessionsContext();
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
