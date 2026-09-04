/**
 * Media fetching for the Instagram sync. The media edge returns one page of the
 * most recently created media, so a single request leaves everything past that
 * page frozen at whatever numbers it last had. These helpers walk the paging
 * cursors instead, and keep the work bounded so a large library cannot run the
 * sync past its time limit or its rate allowance.
 */

export type InstagramMedia = {
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

type MediaPage = { data?: InstagramMedia[]; paging?: { next?: string } };

const graphHost = /(^|\.)(instagram|facebook)\.com$/;

/**
 * A paging cursor is a URL taken from a response body, so it is checked before
 * being followed rather than trusted to point back at Meta.
 */
export function isGraphUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && graphHost.test(url.hostname);
  } catch {
    return false;
  }
}

export type MediaFetchResult = {
  media: InstagramMedia[];
  pages: number;
  /** True when a cap or a failed page stopped the walk before the library ran out. */
  truncated: boolean;
};

export async function fetchAllMedia(options: {
  firstUrl: string;
  maxItems: number;
  maxPages?: number;
  fetchImpl?: typeof fetch;
}): Promise<MediaFetchResult> {
  const { firstUrl, maxItems, maxPages = 40, fetchImpl = fetch } = options;
  const media: InstagramMedia[] = [];
  let next: string | undefined = firstUrl;
  let pages = 0;
  let truncated = false;

  while (next && media.length < maxItems && pages < maxPages) {
    const response = await fetchImpl(next);
    if (!response.ok) {
      // The first page failing means the sync itself failed; a later one just
      // means we keep the pages already gathered.
      if (pages === 0) throw new Error("Instagram did not accept the sync request.");
      truncated = true;
      break;
    }

    pages += 1;
    const payload = (await response.json()) as MediaPage;
    media.push(...(payload.data ?? []));

    const cursor = payload.paging?.next;
    next = cursor && isGraphUrl(cursor) ? cursor : undefined;
  }

  if (next || media.length > maxItems) truncated = true;
  return { media: media.slice(0, maxItems), pages, truncated };
}

/**
 * Every reel costs an insights request, so they are run a few at a time rather
 * than all at once, which would spike Meta's rate limit on a large library.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}
