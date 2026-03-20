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
    const latestItemsRef = useRef<T[]>([]);

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
          latestItemsRef.current = data;
          setItems(data);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Fetch error:", err);
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        });
    }, [apiEndpoint]);

    const persist = useCallback(
      async (item: T): Promise<boolean> => {
        try {
          const res = await fetch(apiEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item),
          });
          if (!res.ok) {
            throw new Error(`Persist failed: ${res.status}`);
          }
          return true;
        } catch (err) {
          setError(err instanceof Error ? err : new Error(String(err)));
          return false;
        }
      },
      [apiEndpoint]
    );

    const upsertItem = useCallback(
      (item: T) => {
        setItems((prev) => {
          const next = upsertLocal(prev, item, idKey);
          latestItemsRef.current = next;
          return next;
        });
        persist(item);
      },
      [persist, idKey]
    );

    const addItem = useCallback(
      (item: T) => upsertItem(item),
      [upsertItem]
    );

    const updateItem = useCallback(
      (item: T) => upsertItem(item),
      [upsertItem]
    );

    const patchItem = useCallback(
      (id: string, patcher: (item: T) => T) => {
        let patchedItem: T | null = null;
        setItems((prev) => {
          const existing = prev.find((item) => item[idKey] === id);
          if (!existing) return prev;
          patchedItem = patcher(existing);
          const next = upsertLocal(prev, patchedItem, idKey);
          latestItemsRef.current = next;
          return next;
        });
        if (patchedItem) persist(patchedItem);
      },
      [persist, idKey]
    );

    const removeItem = useCallback(
      (id: string) => {
        const previousItems = latestItemsRef.current;
        setItems((prev) => {
          const next = prev.filter((item) => item[idKey] !== id);
          latestItemsRef.current = next;
          return next;
        });
        fetch(`${apiEndpoint}/${id}`, { method: "DELETE" }).catch((err) => {
          latestItemsRef.current = previousItems;
          setItems(previousItems);
          setError(err instanceof Error ? err : new Error(String(err)));
        });
      },
      [apiEndpoint, idKey]
    );

    const getItem = useCallback(
      (id: string) => latestItemsRef.current.find((item) => item[idKey] === id),
      [idKey]
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
