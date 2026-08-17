import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { computeAllocationRecommendation } from "@/server/resources/allocationEngine";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "resources.edit")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const contractAreaId = new URL(req.url).searchParams.get("contractAreaId");
  const result = await computeAllocationRecommendation(contractAreaId || undefined);
  return NextResponse.json(result);
}
