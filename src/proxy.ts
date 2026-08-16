import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login"];

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

  // Employees are limited to their own daily view; admins/managers can go anywhere.
  if (user.role === "EMPLOYEE" && !pathname.startsWith("/my-day")) {
    return NextResponse.redirect(new URL("/my-day", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
