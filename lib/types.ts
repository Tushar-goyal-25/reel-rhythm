export type MetricPoint = {
  date: string;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
};

export type Reel = {
  id: string;
  title: string;
  caption: string;
  postedAt: string;
  thumbnail: string;
  permalink?: string;
  source: "instagram" | "manual";
  metrics: MetricPoint[];
};

export type Deadline = {
  id: string;
  title: string;
  startsAt: string;
  calendarEventId?: string;
};

export type Dashboard = {
  reels: Reel[];
  deadlines: Deadline[];
  lastSyncedAt?: string;
};

export type GoogleTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
};
