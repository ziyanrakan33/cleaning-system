import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDashboardStats } from "@/server/dashboard";

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MANAGER")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const stats = await getDashboardStats();
  return NextResponse.json({
    dueTodayCount: stats.dueTodayCount,
    unplannedTodayCount: stats.unplannedTodayCount,
    unplannedToday: stats.unplannedTodayFull,
  });
}
