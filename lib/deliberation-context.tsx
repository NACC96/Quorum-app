"use client";

import { createGenericContext } from "./generic-context";
import type { DeliberationSession } from "@/lib/types";

const { Provider: GenericDeliberationProvider, useGenericContext: useGenericDeliberationContext } =
  createGenericContext<DeliberationSession>();

export function DeliberationProvider({ children }: { children: React.ReactNode }) {
  return (
    <GenericDeliberationProvider apiEndpoint="/api/deliberations" idKey="id">
      {children}
    </GenericDeliberationProvider>
  );
}

export function useDeliberationContext() {
  const ctx = useGenericDeliberationContext();
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
