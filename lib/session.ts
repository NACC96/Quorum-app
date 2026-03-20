import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

function getSessionOptions() {
  const password = process.env.AUTH_SECRET;
  if (!password) {
    throw new Error("AUTH_SECRET environment variable is required. Generate one with: openssl rand -base64 32");
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
