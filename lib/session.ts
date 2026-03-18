import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

const sessionOptions = {
  cookieName: "quorum_session",
  password: process.env.AUTH_SECRET ?? "",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    httpOnly: true,
  },
};

export type SessionData = {
  userId?: string;
  accessToken?: string;
};

export { sessionOptions };

export async function getSession() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  return session;
}