import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 16 renamed Middleware to Proxy. Same job: run before the request.
//
// This is an *optimistic* gate only — it checks that an auth cookie exists, not
// that it's valid. Per the Next.js docs, Proxy must not be treated as the
// authorization boundary. The real check is in each route handler and page
// (requireContext / requirePermission in lib/household.ts), which verifies the
// token against PocketBase. This just saves a signed-out visitor from loading a
// page that would only bounce them anyway.

const PROTECTED = ["/household", "/ledger", "/admin"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (request.cookies.get("hm_auth")) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/household/:path*", "/ledger/:path*", "/admin/:path*"],
};
