const apiBase = "https://api.clickup.com/api/v2";

export class ClickUpClient {
  constructor(token) {
    this.token = token;
    this.taskCache = new Map();
  }

  async request(path, options = {}) {
    if (!this.token) throw new Error("Missing ClickUp personal token.");

    const res = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        Authorization: this.token,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }

    if (!res.ok) {
      const message = body?.err || body?.ECODE || body?.raw || res.statusText;
      throw new Error(`${options.method || "GET"} ${path} failed (${res.status}): ${message}`);
    }

    return body;
  }

  async getWorkspaces() {
    const body = await this.request("/team");
    return body.teams || [];
  }

  async getWorkspaceMembers(workspaceId) {
    const teams = await this.getWorkspaces();
    const team = teams.find((candidate) => String(candidate.id) === String(workspaceId));
    if (!team) throw new Error(`Workspace ${workspaceId} was not found for this token.`);
    return (team.members || []).map((member) => member.user).filter(Boolean);
  }

  async getTimeEntries({ workspaceId, assigneeId, startDate, endDate }) {
    const params = new URLSearchParams({
      start_date: String(startDate.getTime()),
      end_date: String(endDate.getTime()),
    });

    if (assigneeId) params.set("assignee", String(assigneeId));

    const body = await this.request(`/team/${workspaceId}/time_entries?${params.toString()}`);
    return body.data || [];
  }

  async getAllMemberTimeEntries({ workspaceId, members, startDate, endDate }) {
    const memberIds = members.map((member) => member.id).filter(Boolean);
    const chunks = await Promise.all(
      memberIds.map((assigneeId) =>
        this.getTimeEntries({ workspaceId, assigneeId, startDate, endDate }).catch((error) => ({
          error,
          assigneeId,
        }))
      )
    );

    const entries = [];
    const errors = [];
    for (const chunk of chunks) {
      if (Array.isArray(chunk)) entries.push(...chunk);
      else errors.push(chunk);
    }

    return { entries: dedupeById(entries), errors };
  }

  async hydrateTask(taskId) {
    if (!taskId) return null;
    if (this.taskCache.has(taskId)) return this.taskCache.get(taskId);

    const task = await this.request(`/task/${taskId}`);
    this.taskCache.set(taskId, task);
    return task;
  }

  async hydrateTasksForEntries(entries) {
    const taskIds = [...new Set(entries.map(getEntryTaskId).filter(Boolean))];
    const tasks = new Map();

    await Promise.all(
      taskIds.map(async (taskId) => {
        try {
          tasks.set(taskId, await this.hydrateTask(taskId));
        } catch {
          tasks.set(taskId, null);
        }
      })
    );

    return tasks;
  }
}

export function getEntryTaskId(entry) {
  return entry.task?.id || entry.task_id || entry.tid || entry.taskId || "";
}

function dedupeById(entries) {
  const seen = new Set();
  const result = [];

  for (const entry of entries) {
    const key = entry.id || `${getEntryTaskId(entry)}:${entry.start}:${entry.duration}:${entry.user?.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }

  return result;
}

