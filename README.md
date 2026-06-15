# ClickUp Margin Report Extension

Private margin reporting for teams that already track time in ClickUp.

This is the first runnable Chrome extension prototype. It is intentionally small and local-first:

- stores a ClickUp personal token in Chrome extension storage;
- stores people/project rate CSVs in Chrome extension storage;
- reads ClickUp workspace members and time entries;
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

Open the extension options page and set:

- ClickUp personal token;
- Workspace ID;
- lookback days;
- people rates CSV;
- project rates CSV.

Sample CSVs are included in:

- `sample-data/people-rates.csv`
- `sample-data/project-rates.csv`

## Check

```bash
npm run check
```

## People Rates CSV

```csv
clickup_user_id,username,cost_rate,default_bill_rate,role
216168054,Demo Admin,65,140,Project Manager
216168243,Marco,55,135,Designer
216168277,Alice,85,175,Senior Engineer
```

## Project Rates CSV

```csv
clickup_list_id,client,project,bill_rate,budget_hours,target_margin
901417274458,Acme Co,Website Redesign,150,80,0.55
```

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

- Uses a personal token for now, not ClickUp OAuth.
- Stores rates locally in extension storage for now, not Google Sheets.
- Maps projects by ClickUp List ID only.
- Hydrates tasks one-by-one; fine for a prototype, but should be cached/batched more carefully later.
- Does not write anything back to ClickUp.

## Next Build Step

Add Google OAuth + Sheets storage:

- `PeopleRates` tab for private user cost/default bill rates.
- `ProjectRates` tab for list-to-client/project/budget mapping.
- `Reports` tab for generated summaries.
