import { NextResponse } from "next/server";
import { sessionCookieName, sessionCookieOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(sessionCookieName, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
