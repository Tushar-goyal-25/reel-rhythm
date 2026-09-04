import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const savedState = request.cookies.get("reel-rhythm-google-state")?.value;

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(`${origin}/?google=failed`);
  }

  try {
    await exchangeGoogleCode(code, `${origin}/api/google/callback`);
    const response = NextResponse.redirect(`${origin}/?google=connected`);
    response.cookies.set("reel-rhythm-google-state", "", { maxAge: 0, path: "/" });
    return response;
  } catch {
    return NextResponse.redirect(`${origin}/?google=failed`);
  }
}
