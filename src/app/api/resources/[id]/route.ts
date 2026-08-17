import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { QuotaExceededError, setResourceZones } from "@/server/resources/service";

const patchSchema = z.object({
  status: z.enum(["ACTIVE", "BROKEN", "MAINTENANCE", "INACTIVE"]).optional(),
  assignedEmployeeId: z.string().nullable().optional(),
  workHoursStart: z.string().nullable().optional(),
  workHoursEnd: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().optional(),
  /** Replaces the resource's zone restriction outright — used both by manual
   *  editing and by accepting an allocation recommendation. */
  allowedZoneIds: z.array(z.string()).optional(),
  /** Required only when a previous attempt returned 409 (over quota) and the
   *  manager chose to proceed anyway. */
  overrideReason: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { allowedZoneIds, overrideReason, ...rest } = parsed.data;

  // Reassigning which zones a resource may work in is the same authority as
  // the allocation recommendation screen (resources.transfer); everything
  // else (status, hours, notes) only needs general resource editing rights.
  const touchesZones = allowedZoneIds !== undefined;
  const permission = touchesZones ? "resources.transfer" : "resources.edit";
  if (!can(session.user.role, permission)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (Object.keys(rest).length > 0) {
    await prisma.resource.update({ where: { id }, data: rest });
  }

  if (touchesZones) {
    try {
      const resource = await setResourceZones({
        resourceId: id,
        zoneIds: allowedZoneIds,
        userId: session.user.id,
        overrideReason,
        source: "MANUAL",
      });
      return NextResponse.json(resource);
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        return NextResponse.json(
          {
            error: "quota_exceeded",
            message: "ההקצאה חורגת מהכמות החוזית של הקבלן לסוג משאב זה. יש לאשר עם נימוק כדי להמשיך.",
            details: err.details,
          },
          { status: 409 }
        );
      }
      throw err;
    }
  }

  const resource = await prisma.resource.findUnique({ where: { id } });
  return NextResponse.json(resource);
}
