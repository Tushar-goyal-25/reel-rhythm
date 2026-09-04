import { getUpcomingGoogleEvents } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getUpcomingGoogleEvents());
}
