# Changelog

## 0.2.1

### Fixed
- **"not_found_or_authorized" on every report** — the ClickUp API host was
  pinned to a single regional cluster, so workspaces hosted on any other region
  failed to load data (despite showing "Connected to ClickUp"). The extension
  now discovers the correct per-workspace host at runtime.

## 0.2.0

A large release. The extension went from a popup + two separate pages to a
single dashboard app, with invoicing, traceability, and several billing
features validated against the public ClickUp feedback board.

### New
- **Unified dashboard** (`dashboard.html`) — one tabbed app: Report · Rates ·
  Invoices · Settings. Replaces the separate report/options pages. The popup is
  now a slim launcher.
- **Invoices** — generate a printable, branded invoice per client from billable
  time (client-safe: no cost/margin). Company "bill from" details + sequential
  numbering in Settings.
- **Invoice ledger** — generated invoices are tracked: mark paid/unpaid, history
  with outstanding total, and an "Exclude invoiced" toggle so the same hours are
  never billed twice.
- **Time-range presets** — This/Last week, This/Last month, This quarter, This
  year, Last 7/14/30 days, and a custom from–to range; the resolved dates are
  shown.
- **Per-person-per-project bill rates** — override a person's rate on a specific
  project (wins over the project rate and the person's default).
- **Dollar budgets** — set a $ budget per project; over-budget projects are
  flagged alongside the existing hours budget.
- **Breakdowns** — By project / By person / By task / By type, plus utilization,
  effective rate, and billable hours.
- **Audit links** — every hours figure and task links to the relevant ClickUp
  task for verification.
- **Tooltips** — plain-language explanations on metrics and column headers.

### Fixed
- Calculation correctness: lookback window now filtered to the exact dates;
  totals reconcile across all breakdowns; local-time dates; single-currency
  enforced (mixed-currency flagged).
- Robustness: timesheet pagination, retry/backoff on rate limits, bounded
  concurrency, and a coverage banner for partial data.
- Reliability: the content-script ↔ page-bridge handshake no longer gets stuck
  on "Connecting…"; smarter ClickUp-tab selection; clear retry on failure.
- UI: dense dashboard layout, dark-mode-safe tinted surfaces, fixed Settings
  form layout, and removed a phantom horizontal scrollbar.

### Security
- Page bridge uses a private MessageChannel handshake (page-world JS can't drive
  it or read the session token).
- CSV exports are guarded against spreadsheet formula injection.
- Explicit extension-pages CSP.

## 0.1.0

Initial prototype: read ClickUp time entries, map to local cost/bill rates,
compute revenue/cost/margin/budget, export CSV.
