// Plain-language explanations for the finance terms and affordances in the UI.
// Centralized so wording stays consistent across the report, invoice, and rates
// views. Keep each under ~140 chars so the tooltip stays compact.

export const TIPS = {
  // Summary metrics
  revenue: "Billable hours × bill rate, summed across all projects. What you can charge clients.",
  cost: "Tracked hours × each person's internal cost rate. Your delivery cost, not shown to clients.",
  grossProfit: "Revenue minus cost. The money left after paying for the work.",
  margin: "Gross profit ÷ revenue. The share of revenue kept as profit. Higher is better.",
  billableHours: "Hours logged on billable time entries. These generate revenue.",
  trackedHours: "All hours logged, billable or not. Billable + non-billable.",
  utilization: "Billable hours ÷ tracked hours. How much logged time is actually billable.",
  effectiveRate: "Revenue ÷ billable hours. Your real average bill rate after the mix of projects.",
  budgetUsed: "Tracked hours ÷ the project's budget hours. Over 100% means over budget.",
  targetMargin: "Your goal margin for this project. Rows below target are flagged.",
  estimatedRevenue: "Revenue calculated from a person's default bill rate because no project rate was mapped — an estimate, not a contracted rate.",

  // Rate-table columns
  costRate: "What this person costs you per hour internally (salary, overhead). Stays private.",
  defaultBillRate: "Fallback hourly rate used when a project has no bill rate of its own.",
  projectBillRate: "Hourly rate charged to the client for work on this project's ClickUp List.",
  budgetHours: "Planned hours for this project. Used to show budget burn. Optional.",

  // Affordances
  auditLink: "Open this in ClickUp to verify the underlying time entries.",
  refresh: "Re-fetch time data from your ClickUp tab.",
  generateInvoices: "Build a printable invoice per client from billable time.",
  coverage: "Whether every person-week of data loaded. Partial data means totals may be understated.",
};
