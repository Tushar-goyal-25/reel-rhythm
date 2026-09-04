/**
 * A `datetime-local` input yields a naive wall-clock string with no zone, and
 * `new Date(...)` resolves that against the *server's* zone. On Vercel that is
 * UTC, so 11:45 typed in London became 11:45Z and showed up an hour late. The
 * browser sends its IANA zone instead and these helpers anchor the wall clock
 * to it.
 */

const zoneDesignator = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Minutes that `timeZone` is ahead of UTC at `instant`. */
function zoneOffsetMinutes(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour") % 24, read("minute"), read("second"));
  return (asUtc - instant.getTime()) / 60_000;
}

/**
 * The instant a wall-clock reading denotes in `timeZone`. Resolved twice so a
 * reading that falls near a daylight-saving change uses the offset in force at
 * the answer rather than the offset at the guess.
 */
export function instantFromWallClock(wallClock: string, timeZone: string): Date | null {
  const asUtc = new Date(`${wallClock}${wallClock.length === 16 ? ":00" : ""}Z`);
  if (Number.isNaN(asUtc.getTime())) return null;

  const firstPass = new Date(asUtc.getTime() - zoneOffsetMinutes(asUtc, timeZone) * 60_000);
  return new Date(asUtc.getTime() - zoneOffsetMinutes(firstPass, timeZone) * 60_000);
}

/**
 * Turns whatever the client sent into a real instant. Strings that already
 * carry Z or an offset are unambiguous and used as they are.
 */
export function resolveInstant(value: string, timeZone?: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (zoneDesignator.test(trimmed)) {
    const explicit = new Date(trimmed);
    return Number.isNaN(explicit.getTime()) ? null : explicit;
  }

  if (timeZone) {
    try {
      return instantFromWallClock(trimmed, timeZone);
    } catch {
      // An unusable zone name falls through to the server's own reading below.
    }
  }

  const naive = new Date(trimmed);
  return Number.isNaN(naive.getTime()) ? null : naive;
}

/** The wall-clock reading of `instant` in `timeZone`, as Google expects it. */
export function wallClockInZone(instant: Date, timeZone: string) {
  const offset = zoneOffsetMinutes(instant, timeZone);
  return new Date(instant.getTime() + offset * 60_000).toISOString().slice(0, 19);
}
