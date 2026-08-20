import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runFeasibilityCheck } from "@/server/routing/optimization/feasibility";

/** Read-only preview of the §13 feasibility check, usable before attempting to publish. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });

  const { id } = await params;
  try {
    return NextResponse.json(await runFeasibilityCheck(id));
  } catch {
    return NextResponse.json({ error: "תוכנית לא נמצאה" }, { status: 404 });
  }
}
