import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getDashboardStats } from "@/server/dashboard";

export async function GET() {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "reports.view")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const stats = await getDashboardStats();
  return NextResponse.json({
    dueTodayCount: stats.dueTodayCount,
    unplannedTodayCount: stats.unplannedTodayCount,
    unplannedToday: stats.unplannedTodayFull,
  });
}
