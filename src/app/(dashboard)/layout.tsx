import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { canSeeNav, ROLE_LABELS, type Role } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getOrganizationSettings } from "@/server/settings/service";

const NAV_ITEMS = [
  { href: "/", label: "בקרה" },
  { href: "/map", label: "מפת מנהל" },
  { href: "/sources", label: "מקורות ואימות" },
  { href: "/streets", label: "רחובות ושבילים" },
  { href: "/survey", label: "סקר שטח" },
  { href: "/service-points", label: "נקודות מים ופריקה" },
  { href: "/zones", label: "אזורים" },
  { href: "/resources", label: "משאבים" },
  { href: "/defects", label: "ליקויים" },
  { href: "/complaints", label: "תלונות ופניות מוקד" },
  { href: "/inspections", label: "סיורי פיקוח" },
  { href: "/users", label: "משתמשים" },
  { href: "/plans", label: "תוכניות עבודה" },
  { href: "/plans/weekly", label: "לוח שבועי" },
  { href: "/plans/history", label: "היסטוריית גרסאות" },
  { href: "/reports", label: "דוחות" },
  { href: "/learning", label: "למידה מהביצוע" },
  { href: "/settings", label: "הגדרות ומשקלים" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = session?.user?.role;
  const navItems = NAV_ITEMS.filter((item) => canSeeNav(role, item.href));

  // Surfaced in the sidebar so unverified data is visible from every screen,
  // not only when someone thinks to open the sources page.
  const [openConflicts, unassignedZones, overdueDefects, demoZoneCount, org] = await Promise.all([
    prisma.sourceConflict.count({ where: { status: "OPEN" } }),
    prisma.operationalZone.count({ where: { active: true, contractAreaId: null } }),
    canSeeNav(role, "/defects")
      ? prisma.defect.count({
          where: { dueAt: { lt: new Date() }, status: { notIn: ["FIXED", "CLOSED", "REJECTED"] } },
        })
      : Promise.resolve(0),
    prisma.operationalZone.count({ where: { isDemo: true } }),
    getOrganizationSettings(),
  ]);
  const pendingCount = openConflicts + unassignedZones;
  const hasDemoData = demoZoneCount > 0;

  return (
    <div className="flex min-h-screen">
      <aside className="no-print flex w-60 shrink-0 flex-col border-l border-panel-border bg-panel">
        <div className="border-b border-panel-border px-4 py-4">
          <div className="text-sm font-bold leading-tight">ניקיון עירוני</div>
          <div className="text-xs text-muted">{org.name}</div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-foreground/90 transition hover:bg-accent/10 hover:text-accent"
            >
              <span>{item.label}</span>
              {item.href === "/sources" && pendingCount > 0 && (
                <span
                  className="rounded-full bg-warning/20 px-1.5 py-0.5 text-xs font-semibold text-warning tabular-nums"
                  title={`${openConflicts} סתירות פתוחות · ${unassignedZones} אזורים ללא שיוך קבלן`}
                >
                  {pendingCount}
                </span>
              )}
              {item.href === "/defects" && overdueDefects > 0 && (
                <span
                  className="rounded-full bg-danger/20 px-1.5 py-0.5 text-xs font-semibold text-danger tabular-nums"
                  title={`${overdueDefects} ליקויים באיחור`}
                >
                  {overdueDefects}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="border-t border-panel-border p-3 text-xs text-muted">
          <div className="mb-2 truncate">
            {session?.user?.name} · {ROLE_LABELS[role as Role] ?? role}
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="text-accent hover:underline">
              יציאה
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden bg-background">
        {hasDemoData && (
          <div className="no-print border-b border-warning/40 bg-warning/10 px-4 py-1.5 text-center text-xs font-semibold text-warning">
            נתוני הדגמה (DEMO) פעילים במערכת זו — לא לשימוש בעבודה אמיתית. ניתן להסירם ב״הגדרות״.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
