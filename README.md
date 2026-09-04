# Reel Rhythm

A private React tracker for an Instagram publishing habit. It gives you one calendar for every uploaded reel, allows multiple uploads on the same day, and opens a reel's analytics history when you click it. Google Calendar turns the next upload into a deadline with two reminders.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app starts with polished sample data, so the interface is usable before either integration is connected.

## Persistence on Vercel

Add an Upstash Redis integration from the Vercel Marketplace and copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to your Vercel project. Those values make uploads, analytics snapshots, Calendar tokens, and deadlines durable. The storage adapter also accepts the older `KV_REST_*` names if you already have a migrated Vercel KV database. Without Redis, the backend uses an in-memory fallback for local preview only.

## Connect Instagram

1. In Meta for Developers, create an app with Instagram Graph API access.
2. Use an Instagram professional account connected to a Facebook Page.
3. Add the long-lived account token as `INSTAGRAM_ACCESS_TOKEN` and the Instagram business account id as `INSTAGRAM_BUSINESS_ACCOUNT_ID`.
4. Click **Sync Instagram** in the app. Each sync imports video media and writes a fresh analytics snapshot, so the detail panel can show the change over days.

The endpoint intentionally keeps the Instagram token server-side: `POST /api/instagram/sync`.

## Connect Google Calendar

1. Create a Google OAuth web client, enable Google Calendar API, and configure its consent screen.
2. Add these authorised redirect URIs:
   - `http://localhost:3000/api/google/callback`
   - `https://YOUR-VERCEL-DOMAIN/api/google/callback`
3. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env.local` and Vercel.
4. Press **Connect Google Calendar** in the app.

The app asks only for `calendar.events` access. It stores the server-side OAuth tokens in KV and creates a 30-minute event titled `Upload reel · …`, with reminders one day and one hour before.

## Deploy

Import this folder into Vercel, set the environment variables from `.env.example`, and redeploy after adding each integration. Keep all credentials unprefixed: only `NEXT_PUBLIC_*` variables are exposed to the browser in Next.js.
