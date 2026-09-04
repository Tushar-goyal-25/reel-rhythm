"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Dashboard, Reel } from "@/lib/types";

type PanelMode = "detail" | "deadline" | "manual";

type CalendarStatus = {
  connected: boolean;
  reason?: string;
  message?: string;
  durableStorage?: boolean;
  storageError?: string;
};

const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dateKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthName(date: Date) {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(date);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(value),
  );
}

function numeric(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function inputDateTime(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startsOn = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - startsOn + 1));
}

function Arrow({ direction = "right" }: { direction?: "left" | "right" }) {
  return <span className={`arrow arrow-${direction}`} aria-hidden="true">→</span>;
}

function TrendChart({ reel }: { reel: Reel }) {
  const points = reel.metrics;
  if (!points.length) {
    return <div className="empty-chart">Metrics will appear after your first Instagram sync.</div>;
  }

  const max = Math.max(...points.map((point) => point.views), 1);
  const line = points
    .map((point, index) => {
      const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
      const y = 92 - (point.views / max) * 76;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="trend-wrap">
      <svg viewBox="0 0 100 100" role="img" aria-label="Views accumulating by day">
        <path d="M0 92 H100 M0 54 H100 M0 16 H100" className="chart-grid" />
        <polyline points={line} className="chart-line" vectorEffect="non-scaling-stroke" />
        {points.map((point, index) => {
          const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
          const y = 92 - (point.views / max) * 76;
          return <circle key={point.date} cx={x} cy={y} r="2.3" className="chart-dot" />;
        })}
      </svg>
      <div className="chart-axis">
        <span>{points[0].date}</span>
        <span>{points[points.length - 1].date}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [panelMode, setPanelMode] = useState<PanelMode>("detail");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<CalendarStatus>({ connected: false });

  useEffect(() => {
    Promise.all([fetch("/api/dashboard").then((response) => response.json()), fetch("/api/calendar/events").then((response) => response.json())])
      .then(([data, status]) => {
        setDashboard(data as Dashboard);
        setSelectedId((data as Dashboard).reels[0]?.id ?? null);
        setCalendar(status as CalendarStatus);
      })
      .catch(() => setNotice("The tracker could not load. Refresh and try again."));
  }, []);

  const reelsByDay = useMemo(() => {
    const index = new Map<string, Reel[]>();
    dashboard?.reels.forEach((reel) => {
      const key = dateKey(reel.postedAt);
      index.set(key, [...(index.get(key) ?? []), reel]);
    });
    return index;
  }, [dashboard]);

  const deadlinesByDay = useMemo(() => {
    const index = new Map<string, Dashboard["deadlines"]>();
    dashboard?.deadlines.forEach((deadline) => {
      const key = dateKey(deadline.startsAt);
      index.set(key, [...(index.get(key) ?? []), deadline]);
    });
    return index;
  }, [dashboard]);

  const selected = dashboard?.reels.find((reel) => reel.id === selectedId) ?? dashboard?.reels[0];
  const nextDeadline = dashboard?.deadlines
    .filter((deadline) => new Date(deadline.startsAt) >= new Date())
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))[0];

  async function refreshCalendarStatus() {
    try {
      const response = await fetch("/api/calendar/events");
      setCalendar((await response.json()) as CalendarStatus);
    } catch {
      setCalendar({ connected: false });
    }
  }

  async function syncInstagram() {
    setIsSyncing(true);
    setNotice(null);
    try {
      const response = await fetch("/api/instagram/sync", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDashboard(data as Dashboard);
      setSelectedId((data as Dashboard).reels[0]?.id ?? null);
      setNotice("Instagram is up to date.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Instagram could not sync.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function saveDeadline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setIsSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/calendar/deadline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.get("title"), startsAt: form.get("startsAt") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDashboard(data as Dashboard);
      setPanelMode("detail");
      setNotice("Deadline added to your Google Calendar.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Deadline could not be saved.");
      await refreshCalendarStatus();
    } finally {
      setIsSaving(false);
    }
  }

  async function saveManualReel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setIsSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.get("title"), caption: form.get("caption"), postedAt: form.get("postedAt") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDashboard(data as Dashboard);
      setSelectedId((data as Dashboard).reels[0]?.id ?? null);
      setPanelMode("detail");
      setNotice("Upload logged. Analytics will fill in after it syncs from Instagram.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Upload could not be logged.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!dashboard) {
    return <main className="loading-page"><span className="loading-mark">R</span><p>Opening your publishing log…</p></main>;
  }

  const selectedLatest = selected?.metrics[selected.metrics.length - 1];
  const engagement = selectedLatest && selectedLatest.reach
    ? ((selectedLatest.likes + selectedLatest.comments + selectedLatest.shares + selectedLatest.saves) / selectedLatest.reach) * 100
    : 0;
  const days = calendarDays(visibleMonth);
  const now = new Date();

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="wordmark"><span>R</span><strong>Reel Rhythm</strong></div>
        <nav aria-label="Primary navigation">
          <a className="nav-item active" href="#calendar"><i>▦</i> Calendar</a>
          <a className="nav-item" href="#reel-detail"><i>◫</i> Reel library</a>
          <a className="nav-item" href="#integrations"><i>⌘</i> Connections</a>
        </nav>
        <div className="sidebar-foot">
          <span className="sync-dot" />
          <div><small>Instagram</small><strong>{dashboard.lastSyncedAt ? "Synced today" : "Not synced"}</strong></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Publishing rhythm</p>
            <h1>Keep the cadence, quietly.</h1>
          </div>
          <div className="top-actions">
            <button className="quiet-button" onClick={() => setPanelMode("manual")}>Log an upload</button>
            <button className="primary-button" onClick={syncInstagram} disabled={isSyncing}>
              <span className="sync-glyph">↻</span>{isSyncing ? "Syncing…" : "Sync Instagram"}
            </button>
          </div>
        </header>

        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice(null)} aria-label="Dismiss message">×</button></div>}

        {calendar.durableStorage === false && (
          <div className="notice notice-warn" role="status">
            {calendar.storageError
              ? `Redis is configured but did not answer (${calendar.storageError}), so connections fall back to server memory and drop out between requests. UPSTASH_REDIS_REST_URL must be the https:// REST endpoint, not a rediss:// connection string.`
              : "Connections are held in server memory only, so Google Calendar can drop out between requests. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or the KV_REST_API_URL and KV_REST_API_TOKEN pair, to keep it connected."}
          </div>
        )}

        <section className="deadline-banner" id="integrations">
          <div className="deadline-time">
            <span>Next upload</span>
            <strong>{nextDeadline ? shortDate(nextDeadline.startsAt) : "Nothing planned"}</strong>
          </div>
          <div className="deadline-copy">
            <strong>{nextDeadline?.title ?? "Set your next reel deadline"}</strong>
            <p>{nextDeadline ? "Protected time in your publishing calendar." : "A small deadline makes the next post easier to start."}</p>
          </div>
          <div className="deadline-actions">
            {!calendar.connected && (
              <button className="text-button" title={calendar.message} onClick={() => (window.location.href = "/api/google/connect")}>
                {calendar.reason === "expired" || calendar.reason === "refresh-failed" || calendar.reason === "api-refused" ? "Reconnect Google Calendar" : "Connect Google Calendar"} <Arrow />
              </button>
            )}
            {calendar.connected && <span className="connected"><b>●</b> Google Calendar connected</span>}
            <button className="outline-button" onClick={() => setPanelMode("deadline")}>Add deadline</button>
          </div>
        </section>

        <div className="content-grid">
          <section className="calendar-section" id="calendar" aria-label="Upload calendar">
            <div className="calendar-heading">
              <div className="month-switcher">
                <button className="icon-button" onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))} aria-label="Previous month"><Arrow direction="left" /></button>
                <h2>{monthName(visibleMonth)}</h2>
                <button className="icon-button" onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))} aria-label="Next month"><Arrow /></button>
              </div>
              <p><strong>{dashboard.reels.length}</strong> reels logged</p>
            </div>
            <div className="weekday-row">{weekdayNames.map((day) => <span key={day}>{day}</span>)}</div>
            <div className="calendar-grid">
              {days.map((day) => {
                const dayKey = dateKey(day);
                const reels = reelsByDay.get(dayKey) ?? [];
                const deadlines = deadlinesByDay.get(dayKey) ?? [];
                const isCurrent = dayKey === dateKey(now);
                const inMonth = day.getMonth() === visibleMonth.getMonth();
                return (
                  <div className={`calendar-day ${inMonth ? "" : "outside"}`} key={dayKey}>
                    <span className={`day-number ${isCurrent ? "today" : ""}`}>{day.getDate()}</span>
                    <div className="day-content">
                      {reels.slice(0, 2).map((reel) => (
                        <button className={`reel-chip ${selected?.id === reel.id ? "selected" : ""}`} key={reel.id} onClick={() => { setSelectedId(reel.id); setPanelMode("detail"); }}>
                          <img src={reel.thumbnail} alt="" onError={(event) => { event.currentTarget.style.opacity = "0"; }} />
                          <span>{reel.title}</span>
                        </button>
                      ))}
                      {reels.length > 2 && <span className="more-reels">+{reels.length - 2} more</span>}
                      {deadlines.map((deadline) => <span className="deadline-pill" key={deadline.id}>● {deadline.title}</span>)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="calendar-note"><span className="reel-key" /> Uploaded reel <span className="deadline-key" /> Upload deadline</div>
          </section>

          <aside className="detail-panel" id="reel-detail">
            {panelMode === "detail" && selected && (
              <>
                <div className="detail-topline"><span>Selected reel</span><button className="mini-button" onClick={() => setPanelMode("manual")}>+ Log</button></div>
                <div className="reel-preview">
                  <img src={selected.thumbnail} alt="" onError={(event) => { event.currentTarget.style.opacity = "0"; }} />
                  <div className="preview-grain" />
                  <span className="play-mark">▶</span>
                </div>
                <div className="reel-title-row">
                  <div><h2>{selected.title}</h2><p>Posted {shortDate(selected.postedAt)}</p></div>
                  {selected.permalink && <a href={selected.permalink} target="_blank" rel="noreferrer" className="external-link" aria-label="Open reel on Instagram">↗</a>}
                </div>
                <div className="metric-strip">
                  <div><small>Views</small><strong>{numeric(selectedLatest?.views ?? 0)}</strong></div>
                  <div><small>Reach</small><strong>{numeric(selectedLatest?.reach ?? 0)}</strong></div>
                  <div><small>Engagement</small><strong>{engagement.toFixed(1)}%</strong></div>
                </div>
                <section className="chart-section"><div className="section-label"><span>Views over time</span><strong>{selected.metrics.length} day{selected.metrics.length === 1 ? "" : "s"}</strong></div><TrendChart reel={selected} /></section>
                <section className="metric-list" aria-label="Reel metrics">
                  <div><span>Likes</span><strong>{numeric(selectedLatest?.likes ?? 0)}</strong></div>
                  <div><span>Comments</span><strong>{numeric(selectedLatest?.comments ?? 0)}</strong></div>
                  <div><span>Shares</span><strong>{numeric(selectedLatest?.shares ?? 0)}</strong></div>
                  <div><span>Saves</span><strong>{numeric(selectedLatest?.saves ?? 0)}</strong></div>
                </section>
              </>
            )}

            {panelMode === "deadline" && (
              <form className="editor-form" onSubmit={saveDeadline}>
                <button type="button" className="back-button" onClick={() => setPanelMode("detail")}>← Back to reel</button>
                <p className="eyebrow">Calendar deadline</p><h2>Give the next reel a place to land.</h2>
                <label>What are you uploading?<input name="title" required defaultValue="Next reel" /></label>
                <label>When should it be ready?<input name="startsAt" type="datetime-local" required defaultValue={inputDateTime(new Date(Date.now() + 48 * 60 * 60 * 1000))} /></label>
                <p className="form-hint">This creates a 30-minute event and reminders 24 hours and 1 hour before in Google Calendar.</p>
                <button className="primary-button full-button" disabled={isSaving}>{isSaving ? "Adding…" : "Add to Google Calendar"}</button>
              </form>
            )}

            {panelMode === "manual" && (
              <form className="editor-form" onSubmit={saveManualReel}>
                <button type="button" className="back-button" onClick={() => setPanelMode("detail")}>← Back to reel</button>
                <p className="eyebrow">Manual entry</p><h2>Log a reel before its sync arrives.</h2>
                <label>Reel title<input name="title" required placeholder="A quiet Friday night" /></label>
                <label>Posted at<input name="postedAt" type="datetime-local" required defaultValue={inputDateTime(new Date())} /></label>
                <label>Caption <textarea name="caption" placeholder="Optional note for future you" rows={3} /></label>
                <button className="primary-button full-button" disabled={isSaving}>{isSaving ? "Saving…" : "Log upload"}</button>
              </form>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
