import { NextRequest, NextResponse } from "next/server";
import { authConfigured, authRequired, isValidSession, sessionCookieName } from "@/lib/auth";

// Everything except the sign-in page, the endpoints it posts to, and static assets.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/auth/).*)"],
};

export async function middleware(request: NextRequest) {
  if (!authRequired()) return NextResponse.next();

  const isApi = request.nextUrl.pathname.startsWith("/api/");

  if (!authConfigured()) {
    const message = "This deployment has no APP_PASSWORD set, so it refuses to serve rather than exposing your data.";
    return isApi
      ? NextResponse.json({ error: message }, { status: 503 })
      : new NextResponse(message, { status: 503, headers: { "Content-Type": "text/plain" } });
  }

  if (await isValidSession(request.cookies.get(sessionCookieName)?.value)) {
    return NextResponse.next();
  }

  if (isApi) {
    return NextResponse.json({ error: "Sign in to continue.", authenticated: false }, { status: 401 });
  }

  const signIn = new URL("/login", request.url);
  // Google's callback lands here mid-flow, so remember where to return to.
  if (request.nextUrl.pathname !== "/") {
    signIn.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  }
  return NextResponse.redirect(signIn);
}
