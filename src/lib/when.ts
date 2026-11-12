// Human-readable event dates, always in the event's own time zone.
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(key: string, opts: Intl.DateTimeFormatOptions) {
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', opts);
    fmtCache.set(key, f);
  }
  return f;
}

/** '2026-09-10' → 'Thu, Sep 10, 2026' (date-only values are read as UTC so they never shift). */
export function formatDate(dateStr: string, opts: { year?: boolean; weekday?: boolean } = {}): string {
  const { year = true, weekday = true } = opts;
  const d = new Date(`${dateStr}T12:00:00Z`);
  return fmt(`d${year}${weekday}`, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    ...(year ? { year: 'numeric' } : {}),
    ...(weekday ? { weekday: 'short' } : {}),
  }).format(d);
}

export function formatTime(d: Date, tz: string): string {
  return fmt(`t${tz}`, { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d).replace(':00', '');
}

export function formatRange(o: { allDay: boolean; date: string; endDate: string; start: Date | null; end: Date | null }, tz: string, opts: { year?: boolean } = {}) {
  if (o.allDay) {
    return o.endDate !== o.date ? `${formatDate(o.date, opts)} – ${formatDate(o.endDate, opts)}` : formatDate(o.date, opts);
  }
  const day = formatDate(o.date, opts);
  if (!o.end || o.end.getTime() === o.start!.getTime()) return `${day}, ${formatTime(o.start!, tz)}`;
  if (o.endDate !== o.date) return `${day}, ${formatTime(o.start!, tz)} – ${formatDate(o.endDate, opts)}, ${formatTime(o.end, tz)}`;
  return `${day}, ${formatTime(o.start!, tz)} – ${formatTime(o.end, tz)}`;
}

/** Plain-English summary of the RRULEs the editor produces. */
export function describeRrule(rule: string | null): string | null {
  if (!rule) return null;
  const p = Object.fromEntries(rule.split(';').map((kv) => kv.split('=') as [string, string]));
  const n = Number(p.INTERVAL ?? '1');
  const unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[p.FREQ ?? ''] ?? null;
  if (!unit) return 'Repeats (custom rule)';
  const days: Record<string, string> = { MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun' };
  let s = n > 1 ? `Every ${n} ${unit}s` : `Every ${unit}`;
  if (p.BYDAY) s += ` on ${p.BYDAY.split(',').map((d) => days[d.replace(/^[-+]?\d+/, '')] ?? d).join(', ')}`;
  if (p.UNTIL) s += ` until ${formatDate(`${p.UNTIL.slice(0, 4)}-${p.UNTIL.slice(4, 6)}-${p.UNTIL.slice(6, 8)}`, { weekday: false })}`;
  else if (p.COUNT) s += `, ${p.COUNT} times`;
  return s;
}
