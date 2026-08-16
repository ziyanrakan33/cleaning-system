import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { generateWorkPlan } from "@/server/scheduling/engine";

const bodySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [y, m, d] = parsed.data.date.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  try {
    const result = await generateWorkPlan(date, session.user.id);
    return NextResponse.json(result);
  } catch (e) {
    console.error("Plan generation failed:", e);
    return NextResponse.json({ error: "generation_failed", message: (e as Error).message }, { status: 500 });
  }
}
