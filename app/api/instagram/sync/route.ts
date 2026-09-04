import { getDashboard, mergeInstagramReels } from "@/lib/dashboard";
import type { MetricPoint, Reel } from "@/lib/types";

export const dynamic = "force-dynamic";

type InstagramMedia = {
  id: string;
  caption?: string;
  timestamp: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  media_type?: string;
  like_count?: number;
  comments_count?: number;
};

function compactTitle(caption?: string) {
  const firstLine = caption?.split("\n")[0]?.replace(/#\S+/g, "").trim();
  return firstLine?.slice(0, 54) || "Untitled reel";
}

function dayLabel(timestamp: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(timestamp));
}

async function loadInsightValues(mediaId: string, accessToken: string, apiBaseUrl: string) {
  const url = new URL(`${apiBaseUrl}/${mediaId}/insights`);
  url.searchParams.set("metric", "views,reach,saved,shares");
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url);
  if (!response.ok) return {} as Record<string, number>;

  const payload = (await response.json()) as {
    data?: Array<{ name: string; values?: Array<{ value?: number }>; total_value?: { value?: number } }>;
  };
  return Object.fromEntries(
    (payload.data ?? []).map((insight) => [
      insight.name,
      Number(insight.total_value?.value ?? insight.values?.[0]?.value ?? 0),
    ]),
  ) as Record<string, number>;
}

export async function POST() {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const apiMode = process.env.INSTAGRAM_API_MODE === "facebook-login" ? "facebook-login" : "instagram-login";
  if (!accessToken || (apiMode === "facebook-login" && !accountId)) {
    return Response.json(
      { error: apiMode === "facebook-login" ? "Add INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID before syncing." : "Add INSTAGRAM_ACCESS_TOKEN before syncing." },
      { status: 503 },
    );
  }

  const graphVersion = process.env.META_GRAPH_API_VERSION || "v24.0";
  const apiBaseUrl = apiMode === "instagram-login"
    ? `https://graph.instagram.com/${graphVersion}`
    : `https://graph.facebook.com/${graphVersion}`;
  const mediaUrl = new URL(apiMode === "instagram-login" ? `${apiBaseUrl}/me/media` : `${apiBaseUrl}/${accountId}/media`);
  mediaUrl.searchParams.set(
    "fields",
    "id,caption,timestamp,media_url,thumbnail_url,permalink,media_type,like_count,comments_count",
  );
  mediaUrl.searchParams.set("limit", "50");
  mediaUrl.searchParams.set("access_token", accessToken);

  const response = await fetch(mediaUrl);
  if (!response.ok) {
    return Response.json({ error: "Instagram did not accept the sync request." }, { status: response.status });
  }

  const payload = (await response.json()) as { data?: InstagramMedia[] };
  const dashboard = await getDashboard();
  const existingById = new Map(dashboard.reels.map((reel) => [reel.id, reel]));

  const reels = await Promise.all(
    (payload.data ?? [])
      .filter((media) => media.media_type === "VIDEO")
      .map(async (media): Promise<Reel> => {
        const insight = await loadInsightValues(media.id, accessToken, apiBaseUrl);
        const point: MetricPoint = {
          date: dayLabel(new Date().toISOString()),
          views: insight.views ?? 0,
          reach: insight.reach ?? 0,
          likes: media.like_count ?? 0,
          comments: media.comments_count ?? 0,
          shares: insight.shares ?? 0,
          saves: insight.saved ?? 0,
        };
        const previous = existingById.get(media.id);
        const metrics = previous?.metrics ?? [];
        const withoutToday = metrics.filter((snapshot) => snapshot.date !== point.date);

        return {
          id: media.id,
          title: compactTitle(media.caption),
          caption: media.caption ?? "",
          postedAt: media.timestamp,
          thumbnail: media.thumbnail_url ?? media.media_url ?? "",
          permalink: media.permalink,
          source: "instagram",
          metrics: [...withoutToday, point],
        };
      }),
  );

  return Response.json(await mergeInstagramReels(reels));
}
