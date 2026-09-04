/**
 * A single-tenant password gate. Every route that reads or writes the owner's
 * data sits behind it, including the ones that reach Google Calendar, so a
 * deployment URL on its own grants nothing.
 *
 * The session cookie carries its own expiry and an HMAC of it, signed with
 * APP_PASSWORD, so it can be checked in middleware without a store to read.
 * Web Crypto is used throughout because middleware runs on the edge runtime,
 * where Node's crypto module is unavailable.
 */

export const sessionCookieName = "reel-rhythm-session";

const sessionDays = 30;
const encoder = new TextEncoder();

export function authConfigured() {
  return Boolean(process.env.APP_PASSWORD);
}

/**
 * Production refuses to serve without a password rather than falling open,
 * since an unset variable would otherwise leave everything readable. Local
 * development stays open so the app runs straight after a clone.
 */
export function authRequired() {
  return process.env.NODE_ENV === "production" || authConfigured();
}

function base64url(buffer: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Compares without letting the time taken reveal how much of the value matched. */
function constantTimeEquals(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(process.env.APP_PASSWORD ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export function passwordMatches(candidate: string) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return constantTimeEquals(candidate, expected);
}

export async function createSessionToken() {
  const expiresAt = String(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
  return `${expiresAt}.${await sign(expiresAt)}`;
}

export async function isValidSession(token: string | undefined) {
  if (!token || !authConfigured()) return false;

  const separator = token.lastIndexOf(".");
  if (separator < 1) return false;

  const expiresAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;

  return constantTimeEquals(await sign(expiresAt), signature);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: sessionDays * 24 * 60 * 60,
};
