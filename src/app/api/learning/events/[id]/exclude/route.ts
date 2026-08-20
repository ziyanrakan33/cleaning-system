import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { excludeLearningEvent } from "@/server/learning/updateFromExecution";

/** Voids one bad sample and recomputes the field from the remaining evidence. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "learning.review")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const { id } = await params;
  await excludeLearningEvent(id, session.user.id);
  return NextResponse.json({ ok: true });
}
