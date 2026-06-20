// Pure time-range resolution. Turns a preset (or a custom from–to) into local
// day-boundary milliseconds + display labels. Used by the dashboard header and
// passed to the page bridge, which fetches the covering weeks then day-filters.

export const RANGE_PRESETS = [
  { id: "this-week", label: "This week" },
  { id: "last-week", label: "Last week" },
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "this-quarter", label: "This quarter" },
  { id: "this-year", label: "This year so far" },
  { id: "last-7", label: "Last 7 days" },
  { id: "last-14", label: "Last 14 days" },
  { id: "last-30", label: "Last 30 days" },
  { id: "custom", label: "Custom…" },
];

const DAY = 24 * 60 * 60 * 1000;

/**
 * @param {string} preset one of RANGE_PRESETS ids
 * @param {{ customStart?: string, customEnd?: string, now?: Date }} [opts]
 * @returns {{ startMs:number, endMs:number, startLabel:string, endLabel:string, preset:string }}
 */
export function resolveRange(preset, { customStart, customEnd, now = new Date() } = {}) {
  const today = startOfDay(now);
  let start = new Date(today);
  let end = endOfDay(today);

  switch (preset) {
    case "this-week": {
      start = startOfWeek(today);
      break;
    }
    case "last-week": {
      const thisWeek = startOfWeek(today);
      start = addDays(thisWeek, -7);
      end = endOfDay(addDays(thisWeek, -1));
      break;
    }
    case "this-month": {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    }
    case "last-month": {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = endOfDay(new Date(today.getFullYear(), today.getMonth(), 0));
      break;
    }
    case "this-quarter": {
      const q = Math.floor(today.getMonth() / 3);
      start = new Date(today.getFullYear(), q * 3, 1);
      break;
    }
    case "this-year": {
      start = new Date(today.getFullYear(), 0, 1);
      break;
    }
    case "last-7":
      start = addDays(today, -6);
      break;
    case "last-14":
      start = addDays(today, -13);
      break;
    case "last-30":
      start = addDays(today, -29);
      break;
    case "custom": {
      const cs = parseDateInput(customStart);
      const ce = parseDateInput(customEnd);
      if (cs) start = startOfDay(cs);
      if (ce) end = endOfDay(ce);
      // Guard against reversed range.
      if (start.getTime() > end.getTime()) {
        const tmp = start;
        start = startOfDay(ce || cs || today);
        end = endOfDay(cs || ce || today);
      }
      break;
    }
    default:
      // Fallback: last 14 days.
      start = addDays(today, -13);
  }

  return {
    preset,
    startMs: start.getTime(),
    endMs: end.getTime(),
    startLabel: label(start),
    endLabel: label(end),
  };
}

function startOfDay(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function endOfDay(d) {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

function startOfWeek(d) {
  const c = startOfDay(d);
  c.setDate(c.getDate() - c.getDay()); // back to Sunday
  return c;
}

function addDays(d, n) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function parseDateInput(value) {
  if (!value) return null;
  // value is YYYY-MM-DD from a date input; parse as local.
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function label(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
