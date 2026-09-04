import { readStored, writeStored } from "./storage";
import type { Dashboard, Deadline, GoogleTokens, Reel } from "./types";

const dashboardKey = "reel-rhythm:dashboard";
const googleTokensKey = "reel-rhythm:google-tokens";

const sampleDashboard: Dashboard = {
  lastSyncedAt: "2026-09-04T08:30:00.000Z",
  deadlines: [
    { id: "deadline-next", title: "Next reel", startsAt: "2026-09-06T18:00:00.000Z" },
    { id: "deadline-plan", title: "Plan next week", startsAt: "2026-09-09T10:00:00.000Z" },
  ],
  reels: [
    {
      id: "reel-coffee",
      title: "A slow morning in Lisbon",
      caption: "The kind of morning that makes you put your phone away.",
      postedAt: "2026-09-02T08:15:00.000Z",
      thumbnail: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=700&q=85",
      permalink: "https://instagram.com",
      source: "instagram",
      metrics: [
        { date: "Sep 2", views: 1840, reach: 1120, likes: 102, comments: 12, shares: 21, saves: 18 },
        { date: "Sep 3", views: 3850, reach: 2410, likes: 227, comments: 29, shares: 57, saves: 44 },
        { date: "Sep 4", views: 5260, reach: 3360, likes: 310, comments: 41, shares: 78, saves: 69 },
      ],
    },
    {
      id: "reel-studio",
      title: "The studio desk reset",
      caption: "A reset between two busy weeks.",
      postedAt: "2026-09-03T17:40:00.000Z",
      thumbnail: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=700&q=85",
      permalink: "https://instagram.com",
      source: "instagram",
      metrics: [
        { date: "Sep 3", views: 960, reach: 690, likes: 67, comments: 8, shares: 10, saves: 12 },
        { date: "Sep 4", views: 2790, reach: 1850, likes: 182, comments: 20, shares: 38, saves: 30 },
      ],
    },
    {
      id: "reel-train",
      title: "Three stops, one notebook",
      caption: "Notes from the train home.",
      postedAt: "2026-08-29T12:05:00.000Z",
      thumbnail: "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=700&q=85",
      permalink: "https://instagram.com",
      source: "instagram",
      metrics: [
        { date: "Aug 29", views: 3020, reach: 2060, likes: 172, comments: 18, shares: 43, saves: 35 },
        { date: "Aug 30", views: 5880, reach: 3900, likes: 355, comments: 37, shares: 90, saves: 72 },
        { date: "Sep 1", views: 7140, reach: 4750, likes: 425, comments: 48, shares: 111, saves: 89 },
      ],
    },
    {
      id: "reel-ceramics",
      title: "Glaze test, take two",
      caption: "The blue is finally right.",
      postedAt: "2026-08-25T15:30:00.000Z",
      thumbnail: "https://images.unsplash.com/photo-1565193298357-c64470fce35b?auto=format&fit=crop&w=700&q=85",
      permalink: "https://instagram.com",
      source: "instagram",
      metrics: [
        { date: "Aug 25", views: 2410, reach: 1500, likes: 145, comments: 11, shares: 36, saves: 40 },
        { date: "Aug 26", views: 4720, reach: 3020, likes: 287, comments: 25, shares: 68, saves: 77 },
        { date: "Aug 27", views: 5910, reach: 3820, likes: 335, comments: 32, shares: 84, saves: 91 },
      ],
    },
    {
      id: "reel-night",
      title: "A quieter kind of Friday",
      caption: "Nothing scheduled after 8pm.",
      postedAt: "2026-08-22T20:10:00.000Z",
      thumbnail: "https://images.unsplash.com/photo-1519608487953-e999c86e7459?auto=format&fit=crop&w=700&q=85",
      permalink: "https://instagram.com",
      source: "instagram",
      metrics: [
        { date: "Aug 22", views: 1470, reach: 930, likes: 76, comments: 8, shares: 16, saves: 14 },
        { date: "Aug 23", views: 3880, reach: 2500, likes: 210, comments: 24, shares: 57, saves: 51 },
        { date: "Aug 24", views: 4210, reach: 2690, likes: 235, comments: 27, shares: 66, saves: 55 },
      ],
    },
  ],
};

export async function getDashboard(): Promise<Dashboard> {
  return readStored<Dashboard>(dashboardKey, sampleDashboard);
}

export async function saveDashboard(dashboard: Dashboard): Promise<void> {
  await writeStored(dashboardKey, dashboard);
}

export async function createManualReel(reel: Reel): Promise<Dashboard> {
  const dashboard = await getDashboard();
  const updated = { ...dashboard, reels: [reel, ...dashboard.reels] };
  await saveDashboard(updated);
  return updated;
}

export async function addDeadline(deadline: Deadline): Promise<Dashboard> {
  const dashboard = await getDashboard();
  const updated = { ...dashboard, deadlines: [...dashboard.deadlines, deadline] };
  await saveDashboard(updated);
  return updated;
}

export async function replaceInstagramReels(reels: Reel[]): Promise<Dashboard> {
  const dashboard = await getDashboard();
  const nonInstagram = dashboard.reels.filter((reel) => reel.source !== "instagram");
  const updated = { ...dashboard, reels: [...reels, ...nonInstagram], lastSyncedAt: new Date().toISOString() };
  await saveDashboard(updated);
  return updated;
}

export async function getGoogleTokens(): Promise<GoogleTokens | null> {
  return readStored<GoogleTokens | null>(googleTokensKey, null);
}

export async function saveGoogleTokens(tokens: GoogleTokens): Promise<void> {
  await writeStored(googleTokensKey, tokens);
}
