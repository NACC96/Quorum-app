import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
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

  const session = await getIronSession<SessionData>(
    request.cookies as any,
    sessionOptions()
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
    "/api/chat-stream/:path*",
  ],
};
