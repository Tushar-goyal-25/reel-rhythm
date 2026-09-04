import { addDeadline } from "@/lib/dashboard";
import { createGoogleCalendarEvent } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { title?: string; startsAt?: string };
  if (!body.title?.trim() || !body.startsAt) {
    return Response.json({ error: "A title and deadline are required." }, { status: 400 });
  }

  try {
    const calendarEvent = await createGoogleCalendarEvent(body.title.trim(), body.startsAt);
    const dashboard = await addDeadline({
      id: crypto.randomUUID(),
      title: body.title.trim(),
      startsAt: new Date(body.startsAt).toISOString(),
      calendarEventId: calendarEvent.id,
    });
    return Response.json(dashboard, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not add deadline." }, { status: 503 });
  }
}
