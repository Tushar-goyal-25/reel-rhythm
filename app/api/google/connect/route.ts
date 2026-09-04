import { NextResponse } from "next/server";
import { hasGoogleOAuthConfig } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!hasGoogleOAuthConfig()) {
    return NextResponse.json(
      { error: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before connecting Google Calendar." },
      { status: 503 },
    );
  }

  const origin = new URL(request.url).origin;
  const state = crypto.randomUUID();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", `${origin}/api/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.events");
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url);
  response.cookies.set("reel-rhythm-google-state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return response;
}
