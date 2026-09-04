import { createManualReel, getDashboard } from "@/lib/dashboard";
import { resolveInstant } from "@/lib/time";
import type { Reel } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getDashboard());
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: string;
    caption?: string;
    postedAt?: string;
    timeZone?: string;
  };
  if (!body.title?.trim() || !body.postedAt) {
    return Response.json({ error: "A title and posting time are required." }, { status: 400 });
  }

  const postedAt = resolveInstant(body.postedAt, body.timeZone);
  if (!postedAt) {
    return Response.json({ error: "That posting time is not a time we can read." }, { status: 400 });
  }

  const reel: Reel = {
    id: crypto.randomUUID(),
    title: body.title.trim(),
    caption: body.caption?.trim() ?? "Added manually.",
    postedAt: postedAt.toISOString(),
    thumbnail: "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=700&q=85",
    source: "manual",
    metrics: [],
  };

  return Response.json(await createManualReel(reel), { status: 201 });
}
