(() => {
  if (window.__clickupMarginReportBridge) return;
  window.__clickupMarginReportBridge = true;

  const source = "clickup-margin-report-page";
  const requestSource = "clickup-margin-report-content";
  const frontdoorBase = "https://frontdoor-prod-us-east-2-2.clickup.com";
  const identityBase = "https://id.app.clickup.com";
  const tokenCache = new Map();

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== requestSource) return;

    try {
      const result = await handleRequest(message);
      window.postMessage({ source, requestId: message.requestId, ok: true, result }, window.location.origin);
    } catch (error) {
      window.postMessage({ source, requestId: message.requestId, ok: false, error: error.message }, window.location.origin);
    }
  });

  async function handleRequest(message) {
    if (message.type === "GET_CONTEXT") {
      const workspaceId = getWorkspaceId();
      return { workspaceId, url: location.href, title: document.title };
    }

    if (message.type === "GET_MARGIN_DATA") {
      const workspaceId = getWorkspaceId();
      const lookbackDays = Number(message.lookbackDays || 14);
      return getMarginData({ workspaceId, lookbackDays });
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

  async function getAccessToken(workspaceId) {
    const cached = tokenCache.get(workspaceId);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (cached && cached.expiration - 60 > nowSeconds) return cached.token;

    const triggerSource = encodeURIComponent(`${frontdoorBase}/user/v1/user`);
    const res = await fetch(`${identityBase}/data/v3/workspaces/${workspaceId}/authentication/access_tokens?trigger_source=${triggerSource}`, {
      method: "POST",
      credentials: "include",
    });
    const body = await parseJson(res);
    if (!res.ok || !body.token) {
      throw new Error(body.err || body.message || "Could not get ClickUp session token. Reload ClickUp and try again.");
    }

    tokenCache.set(workspaceId, { token: body.token, expiration: body.expiration || nowSeconds + 300 });
    return body.token;
  }

  async function frontdoor(workspaceId, path) {
    const token = await getAccessToken(workspaceId);
    const res = await fetch(`${frontdoorBase}${path}`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await parseJson(res);
    if (!res.ok) {
      throw new Error(body.err || body.message || `${path} failed with ${res.status}`);
    }
    return body;
  }

  async function getMarginData({ workspaceId, lookbackDays }) {
    const users = await getWorkspaceUsers(workspaceId);
    const weekStarts = getWeekStarts(lookbackDays);
    const entries = [];
    const errors = [];

    await Promise.all(
      users.map(async (user) => {
        for (const startOfWeek of weekStarts) {
          try {
            const body = await getTimesheetTasks({ workspaceId, userId: user.id, startOfWeek });
            entries.push(...timesheetTasksToEntries({ tasks: body.timesheet?.tasks || [], user }));
          } catch (error) {
            errors.push({ assigneeId: user.id, message: error.message });
          }
        }
      })
    );

    return {
      workspaceId,
      users,
      entries,
      errors,
      weekStarts,
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

  async function getTimesheetTasks({ workspaceId, userId, startOfWeek }) {
    const params = new URLSearchParams({
      team_id: workspaceId,
      page_count: "100",
      start_of_week: String(startOfWeek),
      timezone: "viewer",
      week_start_day: "viewer",
      as_user: String(userId),
    });

    return frontdoor(workspaceId, `/time-hub-service-v1/workspace/${workspaceId}/timesheet/tasks?${params.toString()}`);
  }

  function timesheetTasksToEntries({ tasks, user }) {
    const rows = [];

    for (const task of tasks) {
      for (const day of task.days || []) {
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
        list: task.hierarchy?.list ? { id: String(task.hierarchy.list.id), name: task.hierarchy.list.name } : null,
        space: task.hierarchy?.space ? { id: String(task.hierarchy.space.id), name: task.hierarchy.space.name } : null,
      },
    };
  }

  function getWeekStarts(lookbackDays) {
    const end = startOfLocalDay(new Date());
    const start = startOfLocalDay(new Date());
    start.setDate(end.getDate() - lookbackDays);

    const firstWeek = startOfWeek(start);
    const weeks = [];
    for (const cursor = new Date(firstWeek); cursor <= end; cursor.setDate(cursor.getDate() + 7)) {
      weeks.push(cursor.getTime());
    }
    return weeks;
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

