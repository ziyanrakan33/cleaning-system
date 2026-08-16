import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { moveTask } from "@/server/scheduling/manualEdit";

const bodySchema = z.object({ targetResourceId: z.string(), targetIndex: z.number().int().min(0) });

export async function POST(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { taskId } = await params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const result = await moveTask(taskId, parsed.data.targetResourceId, parsed.data.targetIndex, session.user.id);
    return NextResponse.json(result);
  } catch (e) {
    console.error("Move task failed:", e);
    return NextResponse.json({ error: "move_failed", message: (e as Error).message }, { status: 500 });
  }
}
