import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { councilSessions } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import type { Session } from "@/lib/types";

export async function GET() {
  const rows = await db
    .select()
    .from(councilSessions)
    .orderBy(desc(councilSessions.updatedAt));

  const sessions: Session[] = rows.map((r) => r.data);
  return NextResponse.json(sessions);
}

export async function POST(request: Request) {
  const session: Session = await request.json();

  await db
    .insert(councilSessions)
    .values({
      id: session.id,
      title: session.title ?? null,
      question: session.question,
      status: session.status,
      data: session,
      createdAt: new Date(session.createdAt),
      updatedAt: new Date(session.updatedAt),
    })
    .onConflictDoUpdate({
      target: councilSessions.id,
      set: {
        title: session.title ?? null,
        question: session.question,
        status: session.status,
        data: session,
        updatedAt: new Date(session.updatedAt),
      },
    });

  return NextResponse.json(session);
}
