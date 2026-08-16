import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recomputePlan } from "@/server/scheduling/recompute";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const result = await recomputePlan(id, session.user.id);
    return NextResponse.json(result);
  } catch (e) {
    console.error("Recompute failed:", e);
    return NextResponse.json({ error: "recompute_failed", message: (e as Error).message }, { status: 500 });
  }
}
