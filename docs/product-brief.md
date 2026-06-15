# ClickUp Margin Report Product Brief

## One-Line Pitch

Already tracking time in ClickUp? Add private rates, margins, budget burn, and invoice-ready exports without moving the team to another timer.

## Target User

- Agencies, consultancies, MSPs, dev shops, and professional services teams using ClickUp for client work.
- ClickUp admins or finance-minded operators who need project profitability from existing time entries.
- Teams that dislike full external timers, but still need bill rates, cost rates, and margin reports.

## Pain

- ClickUp time tracking records effort, but does not natively turn that effort into cost, revenue, gross margin, or invoice-ready reporting.
- Cost rates are sensitive and should not be visible to all workspace members.
- One task can have multiple people logging time, so task assignee is not enough for accurate cost calculation.
- Users often try custom fields, dashboards, Sheets, BI tools, Harvest, Everhour, or Productive. The gap remains for a light ClickUp-native-time-entry layer.

## Evidence Summary

- ClickUp feedback request "Hourly Billable Rates and Cost Rates" has around 1k voters and fresh 2026 comments asking why there is still no timeline.
- Recent Reddit complaints ask for planned vs actuals, resource cost, profitability, client-hour allocation, and less manual setup.
- Competitors such as Everhour, My Hours, Harvest, Toggl, Clockify, and TimeCamp validate demand, but most push teams into another time system.

Source docs in the idea repo:

- `/Users/hengliu/Documents/ideas/ideas/clickup-billable-rates-cost-rates-layer.md`
- `/Users/hengliu/Documents/ideas/research/clickup-margin-report-validation.md`
- `/Users/hengliu/Documents/ideas/research/clickup-billable-hours-integration-competitors.md`

## MVP Wedge

Do not build a timer first.

Build a read-only margin report for teams already tracking time in ClickUp:

1. Read ClickUp time entries.
2. Map each time entry owner to a private cost/default bill rate.
3. Map each ClickUp List to a client/project bill rate and budget.
4. Calculate revenue, internal cost, gross profit, margin, budget used, and missing setup warnings.
5. Export CSV for finance review.

## Product Principle

Use `time_entry.user.id` for cost ownership. Task assignee is useful context, but it is not the financial source of truth.

