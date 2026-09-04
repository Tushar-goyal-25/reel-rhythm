import { getGoogleTokens, saveGoogleTokens } from "./dashboard";
import type { GoogleTokens } from "./types";

const googleTokenUrl = "https://oauth2.googleapis.com/token";

export function hasGoogleOAuthConfig() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export async function getGoogleAccessToken(): Promise<string | null> {
  const stored = await getGoogleTokens();
  const fallback = process.env.GOOGLE_ACCESS_TOKEN;

  if (!stored) return fallback ?? null;
  if (!stored.expiresAt || stored.expiresAt > Date.now() + 60_000) return stored.accessToken;
  if (!stored.refreshToken || !hasGoogleOAuthConfig()) return fallback ?? null;

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

  if (!response.ok) return null;
  const data = (await response.json()) as { access_token: string; expires_in?: number };
  const refreshed: GoogleTokens = {
    ...stored,
    accessToken: data.access_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
  await saveGoogleTokens(refreshed);
  return refreshed.accessToken;
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
  await saveGoogleTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  });
}

export async function createGoogleCalendarEvent(title: string, startsAt: string) {
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) throw new Error("Google Calendar is not connected yet.");

  const starts = new Date(startsAt);
  const ends = new Date(starts.getTime() + 30 * 60 * 1000);
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
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

  if (!response.ok) throw new Error("Google Calendar could not create this deadline.");
  return (await response.json()) as { id: string; htmlLink?: string };
}

export async function getUpcomingGoogleEvents() {
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) return { connected: false, events: [] };

  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("timeMin", new Date().toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "8");

  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return { connected: false, events: [] };
  const data = (await response.json()) as { items?: Array<{ id: string; summary?: string; start?: { dateTime?: string; date?: string } }> };
  return {
    connected: true,
    events: (data.items ?? []).map((event) => ({
      id: event.id,
      title: event.summary ?? "Untitled event",
      startsAt: event.start?.dateTime ?? event.start?.date ?? "",
    })),
  };
}
