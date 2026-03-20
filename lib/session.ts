import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

function getSessionOptions() {
  const password = process.env.AUTH_SECRET;
  if (!password || password.length < 32) {
    throw new Error("AUTH_SECRET environment variable is required and must be at least 32 characters. Generate one with: openssl rand -base64 32");
  }

  return {
    cookieName: "quorum_session",
    password,
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      httpOnly: true,
    },
  };
}

export type SessionData = {
  userId?: string;
  accessToken?: string;
};

export { getSessionOptions as sessionOptions };

export async function getSession() {
  const session = await getIronSession<SessionData>(await cookies(), getSessionOptions());
  return session;
}
