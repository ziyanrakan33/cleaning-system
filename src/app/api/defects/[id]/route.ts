import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  changeStatus,
  decideAppeal,
  decideDeduction,
  DefectError,
  lodgeAppeal,
} from "@/server/defects/service";
import { getDefectDetail } from "@/server/defects/getDefectDetail";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });
  if (!can(session.user.role, "defects.view")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const { id } = await params;
  const detail = await getDefectDetail(id, session.user.role);
  if (!detail) return NextResponse.json({ error: "ליקוי לא נמצא" }, { status: 404 });

  return NextResponse.json(detail);
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    to: z.enum(["NEW", "ASSIGNED", "IN_PROGRESS", "AWAITING_PROOF", "FIXED", "REJECTED", "APPEALED", "CLOSED"]),
    note: z.string().nullish(),
    assignedToId: z.string().nullish(),
  }),
  z.object({
    action: z.literal("deduction"),
    decision: z.enum(["APPROVED", "WAIVED"]),
    amount: z.number().positive().nullish(),
    applySurcharge: z.boolean().optional(),
    reason: z.string().nullish(),
  }),
  z.object({ action: z.literal("appeal"), text: z.string().min(5, "יש לנמק את הערעור") }),
  z.object({
    action: z.literal("appealDecision"),
    accepted: z.boolean(),
    decision: z.string().min(3, "יש לנמק את ההחלטה"),
  }),
]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "לא מזוהה" }, { status: 401 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  try {
    switch (body.action) {
      case "status":
        return NextResponse.json(
          await changeStatus({
            defectId: id,
            to: body.to,
            userId: session.user.id,
            role: session.user.role,
            note: body.note,
            assignedToId: body.assignedToId ?? undefined,
          })
        );

      case "deduction":
        if (!can(session.user.role, "finance.approveDeduction")) {
          return NextResponse.json({ error: "אין הרשאה לאשר קיזוזים" }, { status: 403 });
        }
        return NextResponse.json(
          await decideDeduction({
            defectId: id,
            decision: body.decision,
            amount: body.amount,
            applySurcharge: body.applySurcharge,
            reason: body.reason,
            userId: session.user.id,
          })
        );

      case "appeal":
        if (!can(session.user.role, "defects.appeal")) {
          return NextResponse.json({ error: "אין הרשאה להגיש ערעור" }, { status: 403 });
        }
        return NextResponse.json(
          await lodgeAppeal({ defectId: id, text: body.text, userId: session.user.id })
        );

      case "appealDecision":
        if (!can(session.user.role, "defects.decideAppeal")) {
          return NextResponse.json({ error: "אין הרשאה להכריע בערעור" }, { status: 403 });
        }
        return NextResponse.json(
          await decideAppeal({
            defectId: id,
            accepted: body.accepted,
            decision: body.decision,
            userId: session.user.id,
          })
        );
    }
  } catch (err) {
    if (err instanceof DefectError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
