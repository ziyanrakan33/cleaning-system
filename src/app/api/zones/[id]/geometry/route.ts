import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { setZoneGeometry, type LonLat } from "@/server/geo.service";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  ring: z.array(z.tuple([z.number(), z.number()])).min(4),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const ring = parsed.data.ring as LonLat[];
  // Close the ring if the client didn't already repeat the first point.
  const closed =
    ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring
      : [...ring, ring[0]];

  await setZoneGeometry(id, closed);
  const zone = await prisma.zone.findUnique({ where: { id }, select: { id: true, name: true } });
  return NextResponse.json({ ok: true, zone });
}
