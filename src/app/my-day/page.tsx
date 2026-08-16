import { auth, signOut } from "@/lib/auth";

export default async function MyDayPage() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">התוכנית שלי היום</h1>
          <p className="text-sm text-muted">{session?.user?.name}</p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="text-sm text-accent">יציאה</button>
        </form>
      </div>

      <div className="rounded-xl border border-dashed border-panel-border p-8 text-center text-sm text-muted">
        עדיין אין לך משימות משובצות. תוכניות עבודה יופיעו כאן לאחר בניית מנוע התזמון (Phase 2) והפקת תוכנית ליום.
      </div>
    </div>
  );
}
