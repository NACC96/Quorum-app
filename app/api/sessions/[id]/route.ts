import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { councilSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.delete(councilSessions).where(eq(councilSessions.id, id));
  return NextResponse.json({ ok: true });
}
