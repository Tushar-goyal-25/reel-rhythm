import { getDashboard, mergeInstagramReels } from "@/lib/dashboard";
import { fetchAllMedia, mapWithConcurrency } from "@/lib/instagram";
import type { MetricPoint, Reel } from "@/lib/types";

export const dynamic = "force-dynamic";
// Walking the whole library takes longer than a single page did.
export const maxDuration = 60;

const pageSize = Number(process.env.INSTAGRAM_PAGE_SIZE) || 100;
const maxReels = Number(process.env.INSTAGRAM_MAX_REELS) || 300;
const insightConcurrency = Number(process.env.INSTAGRAM_INSIGHT_CONCURRENCY) || 6;

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
  mediaUrl.searchParams.set("limit", String(pageSize));
  mediaUrl.searchParams.set("access_token", accessToken);

  let media;
  let truncated = false;
  try {
    const fetched = await fetchAllMedia({ firstUrl: mediaUrl.toString(), maxItems: maxReels });
    media = fetched.media;
    truncated = fetched.truncated;
  } catch {
    return Response.json({ error: "Instagram did not accept the sync request." }, { status: 502 });
  }

  const dashboard = await getDashboard();
  const existingById = new Map(dashboard.reels.map((reel) => [reel.id, reel]));

  const reels = await mapWithConcurrency(
    media.filter((item) => item.media_type === "VIDEO"),
    insightConcurrency,
    async (item): Promise<Reel> => {
      const insight = await loadInsightValues(item.id, accessToken, apiBaseUrl);
      const point: MetricPoint = {
        date: dayLabel(new Date().toISOString()),
        views: insight.views ?? 0,
        reach: insight.reach ?? 0,
        likes: item.like_count ?? 0,
        comments: item.comments_count ?? 0,
        shares: insight.shares ?? 0,
        saves: insight.saved ?? 0,
      };
      const previous = existingById.get(item.id);
      const metrics = previous?.metrics ?? [];
      const withoutToday = metrics.filter((snapshot) => snapshot.date !== point.date);

      return {
        id: item.id,
        title: compactTitle(item.caption),
        caption: item.caption ?? "",
        postedAt: item.timestamp,
        thumbnail: item.thumbnail_url ?? item.media_url ?? "",
        permalink: item.permalink,
        source: "instagram",
        metrics: [...withoutToday, point],
      };
    },
  );

  const updated = await mergeInstagramReels(reels);
  return Response.json({ ...updated, syncedReels: reels.length, truncated });
}
