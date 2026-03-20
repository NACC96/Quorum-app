"use client";

import { GenericProvider, useGenericContext } from "./generic-context";
import type { DeliberationSession } from "@/lib/types";

export function DeliberationProvider({ children }: { children: React.ReactNode }) {
  return (
    <GenericProvider<DeliberationSession, "id"> apiEndpoint="/api/deliberations" idKey="id">
      {children}
    </GenericProvider>
  );
}

export function useDeliberationContext() {
  const ctx = useGenericContext<DeliberationSession>();
  return {
    deliberations: ctx.items,
    loading: ctx.loading,
    error: ctx.error,
    addDeliberation: ctx.addItem,
    updateDeliberation: ctx.updateItem,
    patchDeliberation: ctx.patchItem,
    removeDeliberation: ctx.removeItem,
    getDeliberation: ctx.getItem,
  };
}
