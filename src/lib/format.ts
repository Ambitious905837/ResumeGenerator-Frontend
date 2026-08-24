/** Presentation-only helpers. Everything here returns an em dash for missing data. */

const DASH = '—';

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return DASH;
  return new Intl.NumberFormat().format(value);
}

/** Big token counts, as "1.2M" — a table column can't afford nine digits. */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return DASH;
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatMoney(value: number | null | undefined, currency = 'usd'): string {
  if (value === null || value === undefined) return DASH;
  const code = (currency || 'usd').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(value);
  } catch {
    return `${value} ${code}`;
  }
}

/** Auth records stamp epoch seconds. */
export function formatEpoch(seconds: number | null | undefined): string {
  if (!seconds) return DASH;
  try {
    return new Date(seconds * 1000).toLocaleString();
  } catch {
    return DASH;
  }
}

/** Usage rows stamp ISO-8601 strings, not the epoch seconds the auth records use. */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return DASH;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return DASH;
  }
}

/** Compact log timestamp — the date part matters far less than the time part. */
export function formatLogTime(ts: string | null | undefined): string {
  if (!ts) return DASH;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return DASH;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** "1 file" / "2 files" — the parenthesised "(s)" reads like a form. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// --- UTC day helpers -------------------------------------------------------
// Usage rows are stamped in UTC, so the quick ranges must be UTC too: at 01:00 in
// Asia/Kolkata a local "today" would ask for a day the sheet has not reached yet.

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function utcToday(): string {
  return utcDay(new Date());
}

export function utcDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return utcDay(d);
}

export function utcWeekStart(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // back to Monday
  return utcDay(d);
}

export function utcMonthStart(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
