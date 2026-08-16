import { auth, signOut } from "@/lib/auth";
import { MyDayClient } from "./my-day-client";

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

      <MyDayClient />
    </div>
  );
}
