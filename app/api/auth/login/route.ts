import { NextResponse } from "next/server";
import { authConfigured, createSessionToken, passwordMatches, sessionCookieName, sessionCookieOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!authConfigured()) {
    return NextResponse.json({ error: "Set APP_PASSWORD before signing in." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { password?: string };
  if (!body.password || !passwordMatches(body.password)) {
    // Deliberately vague, and slowed a little to blunt guessing.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return NextResponse.json({ error: "That password was not accepted." }, { status: 401 });
  }

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(sessionCookieName, await createSessionToken(), sessionCookieOptions);
  return response;
}
