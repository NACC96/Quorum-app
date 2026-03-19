import { DeliberationSession } from "@/lib/types";

const STORAGE_KEY = "quorum.deliberations.v1";

export function loadDeliberations(): DeliberationSession[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as DeliberationSession[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch {
    return [];
  }
}

export function saveDeliberations(sessions: DeliberationSession[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function upsertDeliberation(
  sessions: DeliberationSession[],
  incoming: DeliberationSession
): DeliberationSession[] {
  const existingIndex = sessions.findIndex((session) => session.id === incoming.id);

  if (existingIndex === -1) {
    return [incoming, ...sessions];
  }

  const next = [...sessions];
  next[existingIndex] = incoming;
  return next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function deleteDeliberation(sessions: DeliberationSession[], id: string): DeliberationSession[] {
  return sessions.filter((session) => session.id !== id);
}
