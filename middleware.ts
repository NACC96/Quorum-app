import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData, sessionOptions } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth/")
  ) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/council") ||
    pathname.startsWith("/session") ||
    pathname.startsWith("/deliberation") ||
    pathname.startsWith("/api/sessions") ||
    pathname.startsWith("/api/deliberations") ||
    pathname.startsWith("/api/chat")
  ) {
    const session = await getIronSession<SessionData>(
      await cookies(),
      sessionOptions
    );

    if (!session.userId) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Authentication required." },
          { status: 401 }
        );
      }

      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/council/:path*",
    "/session/:path*",
    "/deliberation/:path*",
    "/api/sessions/:path*",
    "/api/deliberations/:path*",
    "/api/chat/:path*",
  ],
};
