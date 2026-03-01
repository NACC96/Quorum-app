import { Session } from "@/lib/types";

const STORAGE_KEY = "quorum.sessions.v1";

export function loadSessions(): Session[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as Session[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch {
    return [];
  }
}

export function saveSessions(sessions: Session[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function upsertSession(sessions: Session[], incoming: Session): Session[] {
  const existingIndex = sessions.findIndex((session) => session.id === incoming.id);

  if (existingIndex === -1) {
    return [incoming, ...sessions];
  }

  const next = [...sessions];
  next[existingIndex] = incoming;
  return next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function deleteSession(sessions: Session[], id: string): Session[] {
  return sessions.filter((session) => session.id !== id);
}
