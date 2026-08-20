import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { seedDemoRouting, clearDemoRouting } from "@/server/demo/routingDemo";
import { audit } from "@/server/audit";
import { isDemoModeEnabled } from "@/lib/env";

/** Seeds the §19 demo dataset. */
export async function POST() {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "demo.manage")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }
  if (!isDemoModeEnabled()) {
    return NextResponse.json({ error: "DEMO_MODE אינו מופעל בסביבה זו — לא ניתן לזרוע נתוני הדגמה." }, { status: 403 });
  }

  const result = await seedDemoRouting(session.user.id);
  await audit({
    entityType: "Demo",
    action: "DEMO_SEEDED",
    userId: session.user.id,
    after: result,
    description: "נתוני הדגמה נוצרו",
  });
  return NextResponse.json(result, { status: 201 });
}

/** Deletes every row the demo seed created. */
export async function DELETE() {
  const session = await auth();
  if (!session?.user || !can(session.user.role, "demo.manage")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  await clearDemoRouting();
  await audit({ entityType: "Demo", action: "DEMO_CLEARED", userId: session.user.id, description: "נתוני הדגמה נמחקו" });
  return NextResponse.json({ ok: true });
}
