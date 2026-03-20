import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliberationSessions } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import type { DeliberationSession } from "@/lib/types";

export async function GET() {
  const rows = await db
    .select()
    .from(deliberationSessions)
    .orderBy(desc(deliberationSessions.updatedAt));

  const sessions: DeliberationSession[] = rows.map((r) => r.data);
  return NextResponse.json(sessions);
}

export async function POST(request: Request) {
  let session: DeliberationSession;
  try {
    session = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!session.id || typeof session.id !== "string") {
    return NextResponse.json({ error: "Session 'id' is required." }, { status: 400 });
  }

  if (!session.question || typeof session.question !== "string") {
    return NextResponse.json({ error: "Session 'question' is required." }, { status: 400 });
  }

  await db
    .insert(deliberationSessions)
    .values({
      id: session.id,
      title: session.title ?? null,
      question: session.question,
      phase: session.phase,
      data: session,
      createdAt: new Date(session.createdAt),
      updatedAt: new Date(session.updatedAt),
    })
    .onConflictDoUpdate({
      target: deliberationSessions.id,
      set: {
        title: session.title ?? null,
        question: session.question,
        phase: session.phase,
        data: session,
        updatedAt: new Date(session.updatedAt),
      },
    });

  return NextResponse.json(session);
}
