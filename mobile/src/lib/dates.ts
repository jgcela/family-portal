// Date helpers. All dates are shown in the phone's time zone.

export function atDay(offsetDays: number, hour = 0, minute = 0, base = new Date()): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays, hour, minute);
  return d;
}

/** Next weekday (Mon–Fri) on or after the given offset. */
export function schoolDay(offsetDays: number, hour = 0, minute = 0): Date {
  let d = atDay(offsetDays, hour, minute);
  while (d.getDay() === 0 || d.getDay() === 6) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, hour, minute);
  return d;
}

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromIsoDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthName(m: number): string {
  return MONTHS[m] ?? '';
}

export function shortWeekday(d: Date): string {
  return (WEEKDAYS[d.getDay()] ?? '').slice(0, 3);
}

export function time(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "Today", "Tomorrow", "Wednesday" (this week) or "Wed, Nov 26". */
export function dayLabel(d: Date, now = new Date()): string {
  const diff = daysBetween(now, d);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return WEEKDAYS[d.getDay()] ?? '';
  return `${shortWeekday(d)}, ${(MONTHS[d.getMonth()] ?? '').slice(0, 3)} ${d.getDate()}`;
}

export function longDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "2 h ago", "Yesterday", "Nov 12". */
export function relative(d: Date, now = new Date()): string {
  const mins = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24 && sameDay(d, now)) return `${hours} h ago`;
  if (daysBetween(d, now) === 1) return 'Yesterday';
  return `${(MONTHS[d.getMonth()] ?? '').slice(0, 3)} ${d.getDate()}`;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function firstOfNextMonth(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${MONTHS[d.getMonth()]} 1`;
}
