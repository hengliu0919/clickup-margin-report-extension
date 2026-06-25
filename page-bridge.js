(() => {
  if (window.__clickupMarginReportBridge) return;
  window.__clickupMarginReportBridge = true;

  const PAGE_READY = "clickup-margin-report-page-ready";
  const CONTENT_INIT = "clickup-margin-report-content-init";
  const CONTENT_HELLO = "clickup-margin-report-content-hello";
  // Internal ClickUp endpoints, centralized so an API change is a one-line edit.
  // ClickUp shards every workspace onto a regional "frontdoor" cluster. We resolve
  // the right host per-workspace at runtime (see resolveFrontdoorBase); this is
  // only the last-resort default if discovery fails.
  const DEFAULT_FRONTDOOR_BASE = "https://frontdoor-prod-us-east-2-2.clickup.com";
  const identityBase = "https://id.app.clickup.com";
  const frontdoorBaseCache = new Map();
  const PAGE_COUNT = 100;
  const MAX_PAGES = 50; // safety bound on the pagination loop (5000 tasks/user-week)
  const MAX_CONCURRENCY = 5; // bound the user-week fan-out to avoid rate limiting
  const MAX_RETRIES = 3;
  const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
  const tokenCache = new Map();

  // Accept exactly one private MessagePort from the content script. All requests
  // and replies flow over this port; we never service requests from generic
  // window messages, so page-world JS cannot drive the bridge or read the token.
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const src = event.data?.source;

    // The content script solicits us until we answer; always reply with PAGE_READY
    // so a fresh content-script connection (e.g. after a failed first attempt) can
    // re-handshake. Only the content script can transfer a MessagePort to us, so
    // re-binding to the latest port is safe from page-world JS.
    if (src === CONTENT_HELLO) {
      window.postMessage({ source: PAGE_READY }, window.location.origin);
      return;
    }

    if (src !== CONTENT_INIT) return;
    const [port] = event.ports || [];
    if (!port) return;

    // Bind (or rebind) to the newest port. A new transfer supersedes any prior one.
    port.onmessage = async (msgEvent) => {
      const message = msgEvent.data;
      if (!message || !message.requestId) return;

      // Handshake/health check from the content script.
      if (message.type === "PING") {
        port.postMessage({ requestId: message.requestId, ok: true, result: "pong" });
        return;
      }

      try {
        const result = await handleRequest(message);
        port.postMessage({ requestId: message.requestId, ok: true, result });
      } catch (error) {
        port.postMessage({ requestId: message.requestId, ok: false, error: error.message });
      }
    };
    port.start();
  });

  // Announce readiness so the content script transfers the port promptly.
  window.postMessage({ source: PAGE_READY }, window.location.origin);

  async function handleRequest(message) {
    if (message.type === "GET_CONTEXT") {
      const workspaceId = getWorkspaceId();
      return { workspaceId, url: location.href, title: document.title };
    }

    if (message.type === "GET_MARGIN_DATA") {
      const workspaceId = getWorkspaceId();
      // Prefer an explicit [startMs, endMs] range; fall back to lookbackDays.
      const range = resolveRequestRange(message);
      return getMarginData({ workspaceId, range });
    }

    throw new Error(`Unknown ClickUp bridge request: ${message.type}`);
  }

  function getWorkspaceId() {
    const workspaceId = location.pathname.split("/").filter(Boolean)[0];
    if (!/^\d+$/.test(workspaceId || "")) {
      throw new Error("Open a ClickUp workspace page before running the margin report.");
    }
    return workspaceId;
  }

  // Resolve the frontdoor host for this workspace. ClickUp's web app stashes the
  // per-workspace environment under localStorage.cuHandshake, keyed by workspace
  // id; appEnvironment.apiUrlBase is the exact frontdoor cluster the app itself
  // talks to. Reading that (rather than hardcoding one shard) is what lets the
  // report work for workspaces on any region — a different shard returns
  // "not_found_or_authorized" for a workspace it doesn't host.
  function resolveFrontdoorBase(workspaceId) {
    const cached = frontdoorBaseCache.get(workspaceId);
    if (cached) return cached;

    const base = frontdoorBaseFromHandshake(workspaceId) || DEFAULT_FRONTDOOR_BASE;
    frontdoorBaseCache.set(workspaceId, base);
    return base;
  }

  function frontdoorBaseFromHandshake(workspaceId) {
    let handshake;
    try {
      handshake = JSON.parse(localStorage.getItem("cuHandshake") || "{}");
    } catch {
      return null;
    }
    const entry = handshake?.[workspaceId];
    if (!entry) return null;

    // Prefer the explicit base the app uses; trim a trailing /v1, /v2, etc. as a
    // fallback if only a versioned apiUrl is present.
    const env = entry.appEnvironment || {};
    const explicit = env.apiUrlBase || env.autoPaywallServiceUrl;
    if (typeof explicit === "string" && /^https:\/\/[\w.-]+\.clickup\.com/i.test(explicit)) {
      return stripTrailingSlash(explicit.replace(/\/v\d+.*$/i, ""));
    }
    const versioned = env.apiUrl || env.apiUrlV2;
    if (typeof versioned === "string") {
      const m = versioned.match(/^https:\/\/[\w.-]+\.clickup\.com/i);
      if (m) return m[0];
    }
    // Last resort: reconstruct from the shard id (e.g. "prod-us-east-2-2").
    if (typeof entry.shardId === "string" && /^[\w-]+$/.test(entry.shardId)) {
      return `https://frontdoor-${entry.shardId}.clickup.com`;
    }
    return null;
  }

  function stripTrailingSlash(url) {
    return url.replace(/\/+$/, "");
  }

  async function getAccessToken(workspaceId, { force = false } = {}) {
    const cached = tokenCache.get(workspaceId);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!force && cached && cached.expiration - 60 > nowSeconds) return cached.token;

    const triggerSource = encodeURIComponent(`${resolveFrontdoorBase(workspaceId)}/user/v1/user`);
    const url = `${identityBase}/data/v3/workspaces/${workspaceId}/authentication/access_tokens?trigger_source=${triggerSource}`;
    const res = await fetchWithRetry(url, { method: "POST", credentials: "include" });
    const body = await parseJson(res);
    if (!res.ok || !body.token) {
      throw new Error(body.err || body.message || "Could not get ClickUp session token. Reload ClickUp and try again.");
    }

    tokenCache.set(workspaceId, { token: body.token, expiration: normalizeExpiration(body.expiration, nowSeconds) });
    return body.token;
  }

  async function frontdoor(workspaceId, path, { allowReauth = true } = {}) {
    const token = await getAccessToken(workspaceId);
    const res = await fetchWithRetry(`${resolveFrontdoorBase(workspaceId)}${path}`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    });

    // A 401 usually means the minted token expired mid-run; evict and re-exchange once.
    if (res.status === 401 && allowReauth) {
      tokenCache.delete(workspaceId);
      await getAccessToken(workspaceId, { force: true });
      return frontdoor(workspaceId, path, { allowReauth: false });
    }

    const body = await parseJson(res);
    if (!res.ok) {
      if (body.raw && /<(!doctype|html)/i.test(body.raw)) {
        throw new Error(`ClickUp returned a non-JSON response for ${path} (status ${res.status}). Your session may have expired — reload ClickUp and try again.`);
      }
      throw new Error(body.err || body.message || `${path} failed with ${res.status}`);
    }
    return body;
  }

  async function fetchWithRetry(url, options) {
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const res = await fetch(url, options);
        if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt, res.headers.get("retry-after")));
          continue;
        }
        return res;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt, null));
          continue;
        }
        throw error;
      }
    }
    throw lastError || new Error("Request failed after retries.");
  }

  function backoffMs(attempt, retryAfterHeader) {
    const retryAfter = Number(retryAfterHeader);
    if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 10000);
    const base = 400 * 2 ** attempt; // 400, 800, 1600...
    const jitter = base * 0.25 * pseudoRandom(attempt);
    return Math.min(base + jitter, 10000);
  }

  // Deterministic-ish jitter without Math.random (avoids surprises and is fine here).
  function pseudoRandom(seed) {
    const x = Math.sin((seed + 1) * 99991) * 10000;
    return Math.abs(x - Math.floor(x));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeExpiration(expiration, nowSeconds) {
    const value = Number(expiration);
    if (!Number.isFinite(value) || value <= 0) return nowSeconds + 300;
    // Some endpoints return ms epochs; collapse to seconds if it looks like ms.
    const seconds = value > 1e12 ? Math.floor(value / 1000) : value;
    // If it's a TTL (small) rather than an absolute epoch, treat as relative.
    return seconds < nowSeconds ? nowSeconds + seconds : seconds;
  }

  // Run async work over `items` with at most `limit` in flight at once.
  async function runPool(items, limit, worker) {
    const queue = [...items];
    const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        await worker(item);
      }
    });
    await Promise.all(runners);
  }

  async function getMarginData({ workspaceId, range }) {
    const users = await getWorkspaceUsers(workspaceId);
    const weekStarts = getWeekStartsForRange(range);
    const entries = [];
    const errors = [];
    let truncatedWeeks = 0;
    // Expected vs succeeded user-week slices, so the UI can show coverage and the
    // report can be flagged "partial" instead of looking confidently complete.
    const expectedSlices = users.length * weekStarts.length;
    let completedSlices = 0;

    // Warm the token once before the fan-out so N users don't each race to mint it.
    await getAccessToken(workspaceId);

    const tasks = [];
    for (const user of users) {
      for (const startOfWeek of weekStarts) {
        tasks.push({ user, startOfWeek });
      }
    }

    await runPool(tasks, MAX_CONCURRENCY, async ({ user, startOfWeek }) => {
      try {
        const { rows, truncated } = await getTimesheetEntries({
          workspaceId,
          user,
          startOfWeek,
          range,
        });
        entries.push(...rows);
        if (truncated) truncatedWeeks += 1;
        completedSlices += 1;
      } catch (error) {
        errors.push({ assigneeId: user.id, week: startOfWeek, message: error.message });
      }
    });

    return {
      workspaceId,
      users,
      entries,
      errors,
      weekStarts,
      range,
      coverage: { expectedSlices, completedSlices, truncatedWeeks },
    };
  }

  async function getWorkspaceUsers(workspaceId) {
    const body = await frontdoor(workspaceId, `/v3-user/experience/${workspaceId}/users?includeWorkspaceUserProfile=true`);
    return (body.workspace_users || [])
      .map((workspaceUser) => {
        const data = workspaceUser.data || {};
        const user = data.user || data.workspace_user || data;
        const id = user.id || data.id || workspaceUser.object_id;
        const username = user.username || data.username || user.name || data.name || `User ${id}`;
        return id ? { id: String(id), username } : null;
      })
      .filter(Boolean);
  }

  async function getTimesheetEntries({ workspaceId, user, startOfWeek, range }) {
    const rows = [];
    let truncated = false;
    let page = 0;

    // The timesheet endpoint is paged; without looping, users with more than
    // page_count distinct tasks in a week silently lose everything past page 1.
    for (; page < MAX_PAGES; page += 1) {
      const body = await getTimesheetTasks({ workspaceId, userId: user.id, startOfWeek, page });
      const tasks = body.timesheet?.tasks || [];
      rows.push(...timesheetTasksToEntries({ tasks, user, range }));

      const hasMore =
        body.timesheet?.has_more ??
        body.has_more ??
        (body.timesheet?.last_page === false) ??
        (tasks.length >= PAGE_COUNT);
      if (!hasMore) break;
      if (page === MAX_PAGES - 1) truncated = true;
    }

    return { rows, truncated };
  }

  async function getTimesheetTasks({ workspaceId, userId, startOfWeek, page = 0 }) {
    const params = new URLSearchParams({
      team_id: workspaceId,
      page_count: String(PAGE_COUNT),
      page: String(page),
      start_of_week: String(startOfWeek),
      timezone: "viewer",
      week_start_day: "viewer",
      as_user: String(userId),
    });

    return frontdoor(workspaceId, `/time-hub-service-v1/workspace/${workspaceId}/timesheet/tasks?${params.toString()}`);
  }

  function timesheetTasksToEntries({ tasks, user, range }) {
    const rows = [];

    for (const task of tasks) {
      for (const day of task.days || []) {
        // Weeks are fetched whole (week-granular API), but the lookback window can
        // start/end mid-week. Drop days outside [range.startMs, range.endMs] so a
        // "14-day" report doesn't silently sum the rest of the bounding weeks.
        const dayStart = Number(day.start_of_day || 0);
        if (range && (dayStart < range.startMs || dayStart > range.endMs)) continue;

        const calculations = day.calculations || {};
        const billable = Number(calculations.total_time_tracked_billable || 0);
        const nonBillable = Number(calculations.total_time_tracked_non_billable || 0);
        if (billable > 0) rows.push(toEntry({ task, day, user, duration: billable, billable: true }));
        if (nonBillable > 0) rows.push(toEntry({ task, day, user, duration: nonBillable, billable: false }));
      }
    }

    return rows;
  }

  function toEntry({ task, day, user, duration, billable }) {
    return {
      id: `${user.id}:${task.id}:${day.start_of_day}:${billable ? "billable" : "nonbillable"}`,
      duration,
      billable,
      start: day.start_of_day,
      user: { id: String(user.id), username: user.username },
      task: {
        id: task.id,
        name: task.name,
        // ClickUp "Task Type" (custom_type). null/absent means the default "Task".
        type: taskTypeLabel(task.custom_type),
        list: task.hierarchy?.list ? { id: String(task.hierarchy.list.id), name: task.hierarchy.list.name } : null,
        space: task.hierarchy?.space ? { id: String(task.hierarchy.space.id), name: task.hierarchy.space.name } : null,
      },
    };
  }

  // custom_type may be null (default), an id (number/string), or an object with
  // a name. Normalize to a readable label.
  function taskTypeLabel(customType) {
    if (customType == null || customType === "") return "Task";
    if (typeof customType === "object") return customType.name || customType.label || String(customType.id ?? "Task");
    return String(customType);
  }

  // Build the [start, end] window from the request: an explicit startMs/endMs
  // range (from the dashboard's date-range picker) or a legacy lookbackDays.
  function resolveRequestRange(message) {
    const startMs = Number(message.startMs);
    const endMs = Number(message.endMs);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && startMs > 0 && endMs > startMs) {
      const s = new Date(startMs);
      const e = new Date(endMs);
      return { startMs, endMs, startLabel: localDateLabel(s), endLabel: localDateLabel(e) };
    }
    const lookbackDays = Number(message.lookbackDays || 14);
    const startDate = startOfLocalDay(new Date());
    startDate.setDate(startDate.getDate() - lookbackDays);
    const endDate = startOfLocalDay(new Date());
    endDate.setHours(23, 59, 59, 999);
    return {
      startMs: startDate.getTime(),
      endMs: endDate.getTime(),
      startLabel: localDateLabel(startDate),
      endLabel: localDateLabel(endDate),
    };
  }

  // Every Sunday-aligned week start that overlaps [range.startMs, range.endMs].
  function getWeekStartsForRange(range) {
    const firstWeek = startOfWeek(new Date(range.startMs));
    const end = new Date(range.endMs);
    const weeks = [];
    for (const cursor = new Date(firstWeek); cursor <= end; cursor.setDate(cursor.getDate() + 7)) {
      weeks.push(cursor.getTime());
    }
    return weeks;
  }

  function localDateLabel(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function startOfWeek(date) {
    const copy = startOfLocalDay(date);
    copy.setDate(copy.getDate() - copy.getDay());
    return copy;
  }

  function startOfLocalDay(date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  async function parseJson(res) {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { raw: text };
    }
  }
})();

