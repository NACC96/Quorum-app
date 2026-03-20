"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface GenericContextValue<T> {
  items: T[];
  loading: boolean;
  error: Error | null;
  addItem: (item: T) => void;
  updateItem: (item: T) => void;
  patchItem: (id: string, patcher: (item: T) => T) => void;
  removeItem: (id: string) => void;
  getItem: (id: string) => T | undefined;
}

function upsertLocal<T>(prev: T[], incoming: T, idKey: keyof T): T[] {
  const idx = prev.findIndex((item) => item[idKey] === incoming[idKey]);
  const next = idx === -1 ? [incoming, ...prev] : [...prev];
  if (idx !== -1) next[idx] = incoming;
  return next.sort((a, b) => {
    const aUpdated = (a as Record<string, unknown>).updatedAt as string | undefined;
    const bUpdated = (b as Record<string, unknown>).updatedAt as string | undefined;
    if (aUpdated && bUpdated) return new Date(bUpdated).getTime() - new Date(aUpdated).getTime();
    return 0;
  });
}

export function createGenericContext<T>() {
  const Context = createContext<GenericContextValue<T> | null>(null);

  function Provider({
    children,
    apiEndpoint,
    idKey,
  }: {
    children: React.ReactNode;
    apiEndpoint: string;
    idKey: keyof T;
  }) {
    const [items, setItems] = useState<T[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);
    const loaded = useRef(false);

    useEffect(() => {
      if (loaded.current) return;
      loaded.current = true;
      setLoading(true);
      fetch(apiEndpoint)
        .then((r) => {
          if (!r.ok) {
            throw new Error(`HTTP error! status: ${r.status}`);
          }
          return r.json();
        })
        .then((data: T[]) => {
          setItems(data);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Fetch error:", err);
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        });
    }, [apiEndpoint]);

    const persist = useCallback((item: T) => {
      fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      }).catch(console.error);
    }, [apiEndpoint]);

    const addItem = useCallback(
      (item: T) => {
        setItems((prev) => upsertLocal(prev, item, idKey));
        persist(item);
      },
      [persist, idKey]
    );

    const updateItem = useCallback(
      (item: T) => {
        setItems((prev) => upsertLocal(prev, item, idKey));
        persist(item);
      },
      [persist, idKey]
    );

    const patchItem = useCallback(
      (id: string, patcher: (item: T) => T) => {
        let patchedItem: T | null = null;
        setItems((prev) => {
          const existing = prev.find((item) => item[idKey] === id);
          if (!existing) return prev;
          patchedItem = patcher(existing);
          return upsertLocal(prev, patchedItem, idKey);
        });
        if (patchedItem) persist(patchedItem);
      },
      [persist, idKey]
    );

    const removeItem = useCallback((id: string) => {
      setItems((prev) => prev.filter((item) => item[idKey] !== id));
      fetch(`${apiEndpoint}/${id}`, { method: "DELETE" }).catch(console.error);
    }, [apiEndpoint, idKey]);

    const getItem = useCallback(
      (id: string) => items.find((item) => item[idKey] === id),
      [items, idKey]
    );

    return (
      <Context.Provider
        value={{ items, loading, error, addItem, updateItem, patchItem, removeItem, getItem }}
      >
        {children}
      </Context.Provider>
    );
  }

  function useGenericContext(): GenericContextValue<T> {
    const ctx = useContext(Context);
    if (!ctx) {
      throw new Error("useGenericContext must be used within its matching Provider");
    }
    return ctx;
  }

  return { Provider, useGenericContext };
}
