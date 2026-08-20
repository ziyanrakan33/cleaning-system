import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/** Water and waste points as GeoJSON, for the admin map layers (§14). */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [water, waste] = await Promise.all([
    prisma.waterRefillPoint.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        lat: true,
        lon: true,
        status: true,
        verificationStatus: true,
        flowLitersPerMin: true,
        avgFillMinutes: true,
        avgWaitMinutes: true,
        isDemo: true,
      },
    }),
    prisma.wasteDisposalPoint.findMany({
      where: { active: true },
      select: { id: true, name: true, lat: true, lon: true, status: true, verificationStatus: true, isDemo: true },
    }),
  ]);

  return NextResponse.json({
    type: "FeatureCollection" as const,
    features: [
      ...water.map((w) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [w.lon, w.lat] },
        properties: { ...w, kind: "WATER" as const },
      })),
      ...waste.map((w) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [w.lon, w.lat] },
        properties: { ...w, kind: "WASTE" as const },
      })),
    ],
  });
}
