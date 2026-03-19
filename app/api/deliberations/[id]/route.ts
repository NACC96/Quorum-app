import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliberationSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.delete(deliberationSessions).where(eq(deliberationSessions.id, id));
  return NextResponse.json({ ok: true });
}
