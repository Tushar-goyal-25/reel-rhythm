import { getDashboard, saveDashboard } from "@/lib/dashboard";
import { getUpcomingGoogleEvents, reconcileDeadlines } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getUpcomingGoogleEvents();
  if (!status.connected) return Response.json(status);

  // Google owns the events once created, so an edit or deletion made there is
  // folded back in before the calendar is drawn from the app's own copy.
  const stored = await getDashboard();
  const { deadlines, changed } = await reconcileDeadlines(stored.deadlines);
  if (!changed) return Response.json(status);

  const updated = { ...stored, deadlines };
  await saveDashboard(updated);
  return Response.json({ ...status, dashboard: updated });
}
