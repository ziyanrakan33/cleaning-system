import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { canSeeNav, isFieldOnlyRole } from "@/lib/permissions";

const PUBLIC_PATHS = ["/login"];

/** Top-level sections whose visibility is role-dependent. */
const GUARDED_PREFIXES = ["/sources", "/users", "/defects", "/complaints", "/inspections"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // API routes handle their own auth/role checks per-handler and must return
  // JSON, not an HTML redirect — a redirected fetch() breaks with a JSON
  // parse error client-side. Only page navigation goes through the checks
  // below.
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const user = req.auth?.user;
  if (!user) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Field roles are limited to their own daily view.
  if (isFieldOnlyRole(user.role) && !pathname.startsWith("/my-day")) {
    return NextResponse.redirect(new URL("/my-day", req.nextUrl.origin));
  }

  // Sections that not every dashboard role may open. Redirecting rather than
  // 403ing keeps a mistyped URL from looking like a broken app; the API routes
  // behind these pages enforce the same rules and do return 403.
  const guarded = GUARDED_PREFIXES.find((p) => pathname.startsWith(p));
  if (guarded && !canSeeNav(user.role, guarded)) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
