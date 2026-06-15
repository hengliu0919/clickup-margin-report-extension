# Architecture Notes

## Current Prototype

This is a Manifest V3 Chrome extension with no build step.

- `manifest.json`: extension permissions and entry points.
- `popup.html` / `popup.js`: report generation and CSV export.
- `options.html` / `options.js`: report window, people rates, project rates.
- `content-script.js`: relays popup requests into the active ClickUp page.
- `page-bridge.js`: runs in the ClickUp page context, reuses the logged-in session, and calls ClickUp internal APIs.
- `src/margin.js`: pure margin calculation.
- `src/csv.js`: CSV parsing/export helpers.
- `src/storage.js`: Chrome storage wrapper with localStorage fallback for browser preview.

## Data Flow

```mermaid
flowchart LR
  A["Active ClickUp Tab"] --> B["Page Bridge"]
  B --> C["ClickUp Internal APIs"]
  C --> D["Timesheet Aggregates"]
  E["People Rates CSV"] --> F["Extension Popup"]
  G["Project Rates CSV"] --> F
  D --> F
  F --> H["Margin Summary"]
  F --> I["Invoice/Margin CSV Export"]
```

## Rate Tables

People rates:

```csv
clickup_user_id,username,cost_rate,default_bill_rate,role
216168054,Demo Admin,65,140,Project Manager
216168243,Marco,55,135,Designer
216168277,Alice,85,175,Senior Engineer
```

Project rates:

```csv
clickup_list_id,client,project,bill_rate,budget_hours,target_margin
901417274458,Acme Co,Website Redesign,150,80,0.55
```

## Session Reuse

The prototype no longer asks for a ClickUp personal token or workspace ID.

1. Popup checks the active tab is `https://app.clickup.com/...`.
2. Content script injects `page-bridge.js`.
3. Page bridge detects workspace ID from the URL.
4. Page bridge calls:
   - `POST https://id.app.clickup.com/data/v3/workspaces/{workspace_id}/authentication/access_tokens`
   - then `frontdoor-prod-us-east-2-2.clickup.com` APIs with the returned bearer token.
5. The token stays in page memory and is not stored by the extension.

## Internal APIs Observed

- Workspace token exchange:
  - `POST /data/v3/workspaces/{workspace_id}/authentication/access_tokens?trigger_source=...`
- Workspace users:
  - `GET /v3-user/experience/{workspace_id}/users?includeWorkspaceUserProfile=true`
- Timesheet task aggregates:
  - `GET /time-hub-service-v1/workspace/{workspace_id}/timesheet/tasks?team_id={workspace_id}&page_count=100&start_of_week={ms}&timezone=viewer&week_start_day=viewer&as_user={user_id}`
- Current timer:
  - `GET /scheduling/v1/team/{workspace_id}/time_entries/current`
- Time entry tags:
  - `GET /scheduling/v1/team/{workspace_id}/time_entries/tags`

The margin MVP uses the timesheet task aggregate endpoint. It loops workspace users with `as_user`, then converts per-day billable/non-billable milliseconds into report rows.

## Google Sheets Direction

The prototype stores CSV tables in extension storage so the report can run today. The intended v1 product should use proper Google OAuth and a user-owned Google Sheet:

- Sheet tab `PeopleRates`
- Sheet tab `ProjectRates`
- Sheet tab `Reports`
- optional tab `TimeEntriesCache`

That keeps private rates in the user's Google account and avoids backend storage in v1.

## Public API Fallback

The public API client still exists as a fallback/reference, but the preferred UX is session reuse from an active ClickUp tab.
