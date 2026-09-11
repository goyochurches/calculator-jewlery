// Shared date-formatting helpers. Every ad-hoc `new Date(x).toLocaleDateString()`
// (or worse, an unformatted raw ISO string) across the app rendered a
// different width/shape depending on the browser locale and whether the
// value carried a time component — the usual culprit for a date column that
// wraps or overruns a table cell. These three cover every date shown in the
// app with one consistent, compact, locale-fixed look.
//
// `date-only` values (backend `LocalDate`, e.g. "2026-09-10") are parsed as
// LOCAL midnight (`T00:00:00`, no `Z`) rather than handed to `new Date()`
// as-is — parsing a bare YYYY-MM-DD string parses as UTC midnight, which
// renders as the PREVIOUS day in any timezone behind UTC. Full timestamps
// (with a time component and/or `Z`) parse normally.

function parseDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "Sep 10, 2026" — the default for anywhere a date stands alone (table
 *  cells, detail rows, cards). Short enough to never wrap onto a second
 *  line, unambiguous enough to never need a tooltip. */
export function formatDate(value: string | number | Date | null | undefined, fallback = '—'): string {
  const d = parseDate(value)
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : fallback
}

/** "Sep 10, 2026 · 2:45 PM" — for events where the time matters (sent/opened/
 *  paid timestamps). Still compact — one line, no seconds. */
export function formatDateTime(value: string | number | Date | null | undefined, fallback = '—'): string {
  const d = parseDate(value)
  if (!d) return fallback
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

/** "Sep 10" — for contexts where the year is implied (recent-activity
 *  widgets, "last quote" style captions) and every extra character costs
 *  more than it's worth. */
export function formatShortDate(value: string | number | Date | null | undefined, fallback = '—'): string {
  const d = parseDate(value)
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : fallback
}

/** "September 10" — birthdays/anniversaries: no year (recurring, year-less
 *  by nature), full month name reads warmer than the abbreviation here. */
export function formatMonthDay(value: string | number | Date | null | undefined, fallback = '—'): string {
  const d = parseDate(value)
  return d ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : fallback
}
