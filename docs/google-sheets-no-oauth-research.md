# Google Sheets Without OAuth Research

## Goal

Try a Google Sheets storage option before committing to OAuth.

The product goal is still privacy-first: rates should live in a place the user controls. For now the stable backend is browser-local extension storage plus CSV/JSON import/export.

## Storage Options

### Option 1: Published CSV URL

User publishes a Google Sheet or one tab of it, then the extension reads CSV from a URL.

Example shape:

```text
https://docs.google.com/spreadsheets/d/{spreadsheet_id}/gviz/tq?tqx=out:csv&sheet=PeopleRates
```

Pros:

- No OAuth.
- Easy to parse with the existing CSV importer.
- Good for demo templates and non-sensitive reference data.

Cons:

- Usually public or effectively shareable by link.
- Read-only from the extension's perspective.
- Not acceptable for private employee cost rates unless the user knowingly chooses that tradeoff.

### Option 2: Private Sheet Via Logged-In Browser Session

User opens a private Google Sheet in Chrome, and the extension injects a content script into `docs.google.com/spreadsheets/*`.

The content script would try one of these approaches:

- fetch CSV/export endpoints from the page context using the user's existing Google session;
- read visible table data from the Sheets UI;
- observe Google Sheets internal network calls and replay the least fragile request.

Pros:

- No OAuth consent screen for a prototype.
- Data can remain in the user's own private Google Sheet.
- Matches the ClickUp session-reuse pattern.

Cons:

- Google Sheets is a complex web app; DOM extraction may be brittle.
- Internal endpoints can change.
- Writing back to cells is much harder than reading.
- Chrome Web Store review may dislike a hidden session-reuse pattern for Google data.

### Option 3: Proper Google OAuth

User grants explicit Sheets access. Extension reads/writes `PeopleRates`, `ProjectRates`, and `Reports` tabs through Google Sheets API.

Pros:

- Stable API.
- Clear user consent.
- Supports reliable read/write sync.

Cons:

- OAuth setup, consent screen, scopes, and review burden.
- More product surface before the core ClickUp margin report is proven.

## Recommendation

Keep local browser storage as the production MVP backend.

Add CSV import/export now so users can edit rates in Sheets manually and bring them back into the extension. Then run one no-OAuth Google Sheets experiment:

1. Create a template Sheet with `PeopleRates` and `ProjectRates`.
2. Test published CSV read for both tabs.
3. Test private-session read from an already-open `docs.google.com/spreadsheets/*` tab.
4. Do not implement Sheets writeback until read reliability is proven.

If private-session read is unreliable, move straight to proper OAuth after the margin report has user demand.

## Expected Schemas

`PeopleRates` columns:

```text
clickup_user_id,display_name,role,cost_rate,default_bill_rate,currency,active
```

`ProjectRates` columns:

```text
scope_type,scope_id,scope_name,client,project,bill_rate,budget_hours,target_margin,active
```

## Prototype Acceptance Criteria

- User can export People CSV and Project CSV from the extension.
- User can edit either CSV in Google Sheets.
- User can download the edited CSV and import only that table back into the extension.
- Experimental private Google Sheet read must not replace local storage until it works on multiple Chrome restarts and multiple accounts.
