// Temporary keep-alive for the Render free tier, which spins the service down
// after 15 idle minutes. While the process is running, a scheduler pings the
// app's own PUBLIC url every 14 minutes so Render keeps seeing traffic — but
// only inside the daily active window and only for the configured number of
// days, after which it disarms itself for good. A sleeping process cannot ping
// itself awake, so the 7:00 AM revival on later days comes from the GitHub
// Actions workflow at .github/workflows/keep-alive-wake.yml.
//
// Config (all optional, defaults below):
//   KEEP_ALIVE_START        first active day, YYYY-MM-DD (default 2026-09-16)
//   KEEP_ALIVE_DAYS         number of active days           (default 5)
//   KEEP_ALIVE_URL          public base url to ping         (default RENDER_EXTERNAL_URL)
//   KEEP_ALIVE_TZ_OFFSET_MIN  minutes ahead of UTC for the daily window
//                             (default 330 = IST, Asia/Kolkata)

const START_DATE = String(process.env.KEEP_ALIVE_START || "2026-09-16").trim();
const TOTAL_DAYS = Number(process.env.KEEP_ALIVE_DAYS) || 5;
const TZ_OFFSET_MIN = Number(process.env.KEEP_ALIVE_TZ_OFFSET_MIN) || 330;
const WINDOW_START_MIN = 7 * 60; // 07:00
const WINDOW_END_MIN = 23 * 60 + 45; // 23:45
const PING_INTERVAL_MS = 14 * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The current instant shifted into the configured timezone; read it with getUTC* only. */
const shiftedNow = (now: Date): Date => new Date(now.getTime() + TZ_OFFSET_MIN * 60 * 1000);

const startDayUtcMs = (): number => {
  const [y, m, d] = START_DATE.split("-").map((x) => Number.parseInt(x, 10));
  return Date.UTC(y, (m || 1) - 1, d || 1);
};

// Telemetry for the scheduler's OWN outbound self-pings (inbound hits from
// curl/uptime checkers are deliberately not counted) so the route can prove
// the 14-minute loop is really firing without needing the Render dashboard.
// Process-local: resets whenever Render restarts or redeploys the service.
let pingCount = 0;
let lastPingAt: string | null = null;
let lastPingStatus: number | string | null = null;
let schedulerArmed = false;
const bootedAt = new Date().toISOString();

export type KeepAliveStatus = {
  ok: true;
  service: "keep-alive";
  active: boolean;
  expired: boolean;
  reason: string;
  day: number;
  totalDays: number;
  window: string;
  startsOn: string;
  localTime: string;
  schedulerArmed: boolean;
  pingCount: number;
  lastPingAt: string | null;
  lastPingStatus: number | string | null;
  minutesSinceLastPing: number | null;
  bootedAt: string;
};

export function computeStatus(now: Date = new Date()): KeepAliveStatus {
  const local = shiftedNow(now);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const localMidnightMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  const dayIndex = Math.floor((localMidnightMs - startDayUtcMs()) / MS_PER_DAY);

  const beforePeriod = dayIndex < 0;
  const expired =
    dayIndex >= TOTAL_DAYS || (dayIndex === TOTAL_DAYS - 1 && minutes > WINDOW_END_MIN);
  const inWindow = minutes >= WINDOW_START_MIN && minutes <= WINDOW_END_MIN;
  const active = !beforePeriod && !expired && inWindow;

  const reason = expired
    ? `keep-alive period ended (ran ${TOTAL_DAYS} days from ${START_DATE})`
    : beforePeriod
      ? `keep-alive starts on ${START_DATE}`
      : active
        ? "inside the daily window"
        : "outside the 07:00-23:45 window";

  const hh = String(local.getUTCHours()).padStart(2, "0");
  const mm = String(local.getUTCMinutes()).padStart(2, "0");
  return {
    ok: true,
    service: "keep-alive",
    active,
    expired,
    reason,
    day: Math.min(Math.max(dayIndex + 1, 0), TOTAL_DAYS),
    totalDays: TOTAL_DAYS,
    window: "07:00-23:45 (UTC+05:30)",
    startsOn: START_DATE,
    localTime: `${hh}:${mm}`,
    schedulerArmed,
    pingCount,
    lastPingAt,
    lastPingStatus,
    minutesSinceLastPing: lastPingAt
      ? Math.round(((now.getTime() - Date.parse(lastPingAt)) / 60000) * 10) / 10
      : null,
    bootedAt,
  };
}

const resolveSelfUrl = (): string => {
  const url = String(
    process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || "",
  ).trim();
  return url.replace(/\/+$/, "");
};

/**
 * Started from server.ts. No-op unless a public url is known (KEEP_ALIVE_URL,
 * or RENDER_EXTERNAL_URL which Render sets automatically), so local dev never
 * pings the live deployment.
 */
export function startKeepAliveScheduler(): void {
  const baseUrl = resolveSelfUrl();
  if (!baseUrl) {
    console.log("Keep-alive scheduler disabled (no KEEP_ALIVE_URL/RENDER_EXTERNAL_URL).");
    return;
  }
  if (computeStatus().expired) {
    console.log("Keep-alive period already over; scheduler not started.");
    return;
  }

  const ping = async (attempt = 1): Promise<void> => {
    try {
      const res = await fetch(`${baseUrl}/api/keep-alive`, { cache: "no-store" });
      pingCount += 1;
      lastPingAt = new Date().toISOString();
      lastPingStatus = res.status;
      console.log(`Keep-alive ping #${pingCount} -> ${res.status} at ${lastPingAt}`);
    } catch (error) {
      const message = (error as Error).message;
      lastPingStatus = `error: ${message}`;
      console.error(`Keep-alive ping failed (attempt ${attempt}):`, message);
      // One 15-minute idle gap puts the service to sleep, so retry quickly.
      if (attempt < 3) setTimeout(() => ping(attempt + 1), 60 * 1000);
    }
  };

  const tick = () => {
    const status = computeStatus();
    if (status.expired) {
      clearInterval(timer);
      console.log("Keep-alive period ended; scheduler stopped for good.");
      return;
    }
    if (!status.active) return; // outside 07:00-23:45 — let Render sleep
    void ping();
  };

  const timer = setInterval(tick, PING_INTERVAL_MS);
  setTimeout(tick, 45 * 1000); // first ping shortly after boot (e.g. the 7 AM wake-up)
  schedulerArmed = true;
  console.log(
    `Keep-alive scheduler started: ping every 14 min, 07:00-23:45 IST, ${TOTAL_DAYS} days from ${START_DATE}, target ${baseUrl}`,
  );
}
