import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/", label: "בקרה" },
  { href: "/map", label: "מפת מנהל" },
  { href: "/streets", label: "רחובות ושבילים" },
  { href: "/zones", label: "אזורים" },
  { href: "/resources", label: "משאבים" },
  { href: "/plans", label: "תוכניות עבודה" },
  { href: "/plans/weekly", label: "לוח שבועי" },
  { href: "/reports", label: "דוחות" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div className="flex min-h-screen">
      <aside className="no-print flex w-60 shrink-0 flex-col border-l border-panel-border bg-panel">
        <div className="border-b border-panel-border px-4 py-4">
          <div className="text-sm font-bold leading-tight">ניקיון עירוני</div>
          <div className="text-xs text-muted">כפר סבא</div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-foreground/90 transition hover:bg-accent/10 hover:text-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-panel-border p-3 text-xs text-muted">
          <div className="mb-2 truncate">{session?.user?.name} · {session?.user?.role}</div>
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
      <main className="flex-1 overflow-x-hidden bg-background">{children}</main>
    </div>
  );
}
