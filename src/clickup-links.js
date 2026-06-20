// Builders for app.clickup.com audit deep-links. URL formats verified live in a
// logged-in ClickUp tab (see the clickup-deeplink-urls memory):
//  - task:           https://app.clickup.com/t/{taskId}  (redirects to /t/{ws}/{taskId})
//  - timesheet week: https://app.clickup.com/{ws}/time?start_of_week={ms}
// List/project deep-links are intentionally omitted — the List URL uses a VIEW
// id we don't capture, not the numeric list id, so it can't be built reliably.

const BASE = "https://app.clickup.com";

/** Link to a specific task. Returns "" if no task id. */
export function taskUrl(taskId) {
  return taskId ? `${BASE}/t/${encodeURIComponent(taskId)}` : "";
}

/**
 * Link to the workspace timesheet, scrolled to the week containing `whenMs`.
 * Snaps to the start of that week (Sunday 00:00 local) to match ClickUp's
 * start_of_week semantics.
 * @param {string|number} workspaceId
 * @param {number} [whenMs] a representative timestamp in the desired week
 */
export function timesheetWeekUrl(workspaceId, whenMs) {
  if (!workspaceId) return "";
  const base = `${BASE}/${encodeURIComponent(workspaceId)}/time`;
  const start = startOfWeekMs(whenMs);
  return start ? `${base}?start_of_week=${start}` : base;
}

function startOfWeekMs(whenMs) {
  const ms = Number(whenMs);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // back up to Sunday
  return d.getTime();
}
