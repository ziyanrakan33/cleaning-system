import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";

async function authenticate(formData: FormData) {
  "use server";
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const callbackUrl = (formData.get("callbackUrl") as string) || "/";

  try {
    await signIn("credentials", { email, password, redirectTo: callbackUrl });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/login?error=1&callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }
    throw error;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-panel-border bg-panel p-8 shadow-xl">
        <h1 className="mb-1 text-xl font-bold">מערכת ניקיון עירוני</h1>
        <p className="mb-6 text-sm text-muted">כפר סבא — כניסת מנהלים ועובדים</p>

        {params.error && (
          <div className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            אימייל או סיסמה שגויים
          </div>
        )}

        <form action={authenticate} className="flex flex-col gap-4">
          <input type="hidden" name="callbackUrl" value={params.callbackUrl ?? "/"} />
          <div>
            <label className="mb-1 block text-sm font-medium">אימייל</label>
            <input
              name="email"
              type="email"
              required
              dir="ltr"
              className="w-full rounded-md border border-panel-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="admin@kfar-saba-cleaning.local"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">סיסמה</label>
            <input
              name="password"
              type="password"
              required
              dir="ltr"
              className="w-full rounded-md border border-panel-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
          >
            כניסה
          </button>
        </form>
      </div>
    </div>
  );
}
