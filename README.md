# ClickUp Margin Report Extension

Private margin reporting for teams that already track time in ClickUp.

This is the first runnable Chrome extension prototype. It is intentionally small and local-first:

- reuses the active ClickUp browser session;
- detects the selected workspace from the active `app.clickup.com` tab;
- imports ClickUp users and project Lists into editable local rate tables;
- stores people/project rates in browser-local extension storage;
- supports dated CSV import/export for each rate table and dated JSON import/export for full settings backups;
- reads ClickUp workspace members and timesheet aggregates;
- calculates revenue, delivery cost, gross profit, margin, and budget burn;
- exports entry-level margin CSV.

The product direction is still privacy-first Google OAuth + user-owned Google Sheet. This prototype proves the ClickUp/time-entry/margin loop before adding Google Sheets.

## Load In Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder:

```text
/Users/hengliu/Documents/projects/clickup-margin-report-extension
```

## Configure

Open a ClickUp workspace tab, then open the options page and click **Import users and projects from ClickUp**.

The options page lets you maintain:

- lookback days;
- people rates keyed by imported ClickUp user ID;
- project rates keyed by imported ClickUp List ID;
- validation warnings for missing rates, duplicate rows, and manually added rows that are not connected to ClickUp.

Fields marked `ClickUp` are read-only references synced from the active workspace. Fields marked `Local` or rendered as normal inputs are private margin settings owned by the extension user and stored locally in the browser profile.

Use **Local Backup** to export or import either:

- People CSV only;
- Project CSV only;
- full JSON settings backup.

Exported files include the export date in the filename.

After the rate tables are valid enough, open the extension popup from a ClickUp workspace tab and run the report.

## Check

```bash
npm run check
```

## People Rates

People rows are imported from ClickUp workspace members. Name and user ID are read-only ClickUp references. The user edits role, cost rate, default bill rate, currency, and whether the person is active in reports.

## Project Rates

Project rows are imported from ClickUp Lists that have tracked time in the report window. Location name and ID are read-only ClickUp references. The user edits client, project, bill rate, budget hours, target margin, and whether the project is active in reports.

CSV samples are kept in `sample-data/` for smoke tests, manual editing, and migration checks.

## Report Logic

The calculation uses `time_entry.user.id` as the source of cost ownership. Task assignee is not used for margin ownership because ClickUp tasks can be unassigned or assigned to someone different from the person who logged time.

For each time entry:

```text
hours = duration_ms / 1000 / 60 / 60
revenue = billable ? hours * project_bill_rate : 0
cost = hours * user_cost_rate
gross_profit = revenue - cost
margin = gross_profit / revenue
```

## Current Limitations

- Uses ClickUp internal web APIs discovered from the logged-in app. This is a great UX but can break if ClickUp changes frontend endpoints.
- Stores rates locally in extension storage for now, not Google Sheets or ClickUp.
- Google Sheets without OAuth is research-only. Published CSV can work for read-only public sheets, while private Google Sheets session reuse needs a separate browser-tab experiment.
- Maps projects by ClickUp List ID only.
- Uses timesheet task aggregates, not raw individual time-entry descriptions.
- Does not write anything back to ClickUp.

## Future ClickUp Backend Research

ClickUp custom fields are not the backend for this MVP. Normal custom fields were visible to non-admin users in testing, and private custom field creation failed on the current workspace with a paid-plan upgrade error.

Research notes are saved in:

- `docs/clickup-custom-fields-backend-research.md`
- `docs/google-sheets-no-oauth-research.md`

## Next Build Step

Add Google OAuth + Sheets storage:

- `PeopleRates` tab for private user cost/default bill rates.
- `ProjectRates` tab for list-to-client/project/budget mapping.
- `Reports` tab for generated summaries.
