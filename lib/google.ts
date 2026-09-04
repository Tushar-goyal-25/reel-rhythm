import { getGoogleTokens, saveGoogleTokens } from "./dashboard";
import { checkStorage, hasDurableStorage } from "./storage";
import type { GoogleTokens } from "./types";

const googleTokenUrl = "https://oauth2.googleapis.com/token";

/** Why the Google Calendar connection is, or is not, usable right now. */
export type GoogleConnectionReason =
  | "connected"
  | "never-connected"
  | "no-durable-storage"
  | "expired"
  | "refresh-failed"
  | "api-refused";

export type GoogleAccess = {
  accessToken: string | null;
  reason: GoogleConnectionReason;
  detail?: string;
};

/** Thrown when the calendar cannot be reached because the connection itself is unusable. */
export class GoogleConnectionError extends Error {
  readonly reason: GoogleConnectionReason;

  constructor(reason: GoogleConnectionReason, message: string) {
    super(message);
    this.name = "GoogleConnectionError";
    this.reason = reason;
  }
}

export function hasGoogleOAuthConfig() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function connectionMessage(reason: GoogleConnectionReason, detail?: string) {
  switch (reason) {
    case "connected":
      return "Google Calendar is connected.";
    case "no-durable-storage":
      return "No Google Calendar tokens are stored, and this deployment has no durable storage: connections are held in server memory and do not survive between requests. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, then connect.";
    case "expired":
      return "The Google Calendar connection expired and Google did not return a refresh token. Reconnect Google Calendar.";
    case "api-refused":
      return detail
        ? `Google Calendar refused the request: ${detail}. Reconnect Google Calendar.`
        : "Google Calendar refused the request. Reconnect Google Calendar.";
    case "refresh-failed":
      return detail
        ? `Google refused to refresh the Calendar connection: ${detail}. Reconnect Google Calendar.`
        : "Google refused to refresh the Calendar connection. Reconnect Google Calendar.";
    default:
      return "Google Calendar is not connected yet. Press Connect Google Calendar first.";
  }
}

async function googleErrorText(response: Response) {
  try {
    const body = (await response.json()) as {
      error?: string | { message?: string };
      error_description?: string;
    };
    if (typeof body.error === "object" && body.error?.message) return body.error.message;
    if (body.error_description) return body.error_description;
    if (typeof body.error === "string") return body.error;
  } catch {
    // Fall through to the status line below.
  }
  return `${response.status} ${response.statusText}`.trim();
}

/**
 * Resolves an access token and, when there is none, says why. Every caller
 * needs the reason so the interface never claims a connection it cannot use.
 */
export async function resolveGoogleAccess(): Promise<GoogleAccess> {
  const stored = await getGoogleTokens();
  const fallback = process.env.GOOGLE_ACCESS_TOKEN;

  if (!stored) {
    if (fallback) return { accessToken: fallback, reason: "connected" };
    return { accessToken: null, reason: hasDurableStorage() ? "never-connected" : "no-durable-storage" };
  }

  if (!stored.expiresAt || stored.expiresAt > Date.now() + 60_000) {
    return { accessToken: stored.accessToken, reason: "connected" };
  }

  if (!stored.refreshToken || !hasGoogleOAuthConfig()) {
    if (fallback) return { accessToken: fallback, reason: "connected" };
    return { accessToken: null, reason: "expired" };
  }

  const response = await fetch(googleTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: stored.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    return { accessToken: null, reason: "refresh-failed", detail: await googleErrorText(response) };
  }

  const data = (await response.json()) as { access_token: string; expires_in?: number };
  const refreshed: GoogleTokens = {
    ...stored,
    accessToken: data.access_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
  await saveGoogleTokens(refreshed);
  return { accessToken: refreshed.accessToken, reason: "connected" };
}

export async function getGoogleAccessToken(): Promise<string | null> {
  return (await resolveGoogleAccess()).accessToken;
}

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const response = await fetch(googleTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) throw new Error("Google did not accept the connection request.");
  const data = (await response.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  const existing = await getGoogleTokens();
  await saveGoogleTokens({
    accessToken: data.access_token,
    // Google omits the refresh token when the user has already consented, so
    // keep the one we hold rather than losing the ability to refresh.
    refreshToken: data.refresh_token ?? existing?.refreshToken,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  });
}

export async function createGoogleCalendarEvent(title: string, startsAt: string) {
  const access = await resolveGoogleAccess();
  if (!access.accessToken) {
    throw new GoogleConnectionError(access.reason, connectionMessage(access.reason, access.detail));
  }

  const starts = new Date(startsAt);
  const ends = new Date(starts.getTime() + 30 * 60 * 1000);
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${access.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: `Upload reel · ${title}`,
        description: "Created by Reel Rhythm.",
        start: { dateTime: starts.toISOString() },
        end: { dateTime: ends.toISOString() },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 24 * 60 },
            { method: "popup", minutes: 60 },
          ],
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Google Calendar could not create this deadline: ${await googleErrorText(response)}`);
  }
  return (await response.json()) as { id: string; htmlLink?: string };
}

export async function getUpcomingGoogleEvents() {
  const [access, storage] = await Promise.all([resolveGoogleAccess(), checkStorage()]);
  const durableStorage = storage.configured && storage.reachable;
  const storageError = storage.configured && !storage.reachable ? storage.error : undefined;
  if (!access.accessToken) {
    return {
      connected: false,
      reason: access.reason,
      message: connectionMessage(access.reason, access.detail),
      durableStorage,
      storageError,
      events: [],
    };
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("timeMin", new Date().toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "8");

  const response = await fetch(url, { headers: { Authorization: `Bearer ${access.accessToken}` } });
  if (!response.ok) {
    return {
      connected: false,
      reason: "api-refused" as const,
      message: `Google Calendar refused the request: ${await googleErrorText(response)}`,
      durableStorage,
      storageError,
      events: [],
    };
  }

  const data = (await response.json()) as { items?: Array<{ id: string; summary?: string; start?: { dateTime?: string; date?: string } }> };
  return {
    connected: true,
    reason: "connected" as const,
    message: connectionMessage("connected"),
    durableStorage,
    storageError,
    events: (data.items ?? []).map((event) => ({
      id: event.id,
      title: event.summary ?? "Untitled event",
      startsAt: event.start?.dateTime ?? event.start?.date ?? "",
    })),
  };
}
