import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

interface AuthUser {
  username: string;
  password: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { username, password } = body as { username?: string; password?: string };

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required." },
        { status: 400 }
      );
    }

    const authUsersEnv = process.env.AUTH_USERS;
    if (!authUsersEnv) {
      return NextResponse.json(
        { error: "Authentication is not configured." },
        { status: 500 }
      );
    }

    let authUsers: AuthUser[];
    try {
      authUsers = JSON.parse(authUsersEnv);
    } catch {
      return NextResponse.json(
        { error: "Invalid AUTH_USERS configuration." },
        { status: 500 }
      );
    }

    const user = authUsers.find(
      (u) => u.username === username && u.password === password
    );

    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    const session = await getSession();
    session.userId = username;
    await session.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
