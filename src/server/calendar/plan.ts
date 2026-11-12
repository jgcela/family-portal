// Import planning: decides, per incoming event, whether it is new, an update
// of an event imported before, unchanged, or a likely duplicate of an event
// that already exists. Pure functions, so every rule is unit-testable.
import { createHash } from 'node:crypto';
import type { ParsedEvent } from './parse';

export type ExistingEvent = {
  id: string;
  title: string;
  allDay: boolean;
  startDate: string | null;
  startsAt: Date | null;
  timezone: string;
  externalUid: string | null;
  externalHash: string | null;
};

export type PlanAction = 'new' | 'update' | 'unchanged' | 'duplicate' | 'cancel';

export type PlanItem = {
  row: number;
  action: PlanAction;
  /** Existing event this item updates, cancels or duplicates. */
  existingId: string | null;
  /** Stable key used to match the item on re-import. */
  uid: string;
  hash: string;
  event: ParsedEvent;
};

export type ImportPlan = {
  items: PlanItem[];
  counts: Record<PlanAction, number>;
};

/** Content hash: changes whenever anything a family would see changes. */
export function eventHash(e: ParsedEvent): string {
  const parts = [
    e.title,
    e.description ?? '',
    e.location ?? '',
    e.category ?? '',
    e.url ?? '',
    e.allDay ? 'A' : 'T',
    e.startDate,
    e.endDate,
    e.startsAt?.toISOString() ?? '',
    e.endsAt?.toISOString() ?? '',
    e.timezone,
    e.rrule ?? '',
    [...e.exdates].sort().join(','),
    e.cancelled ? 'X' : '',
  ];
  return createHash('sha256').update(parts.join('\u001f')).digest('hex').slice(0, 32);
}

export function normalizeTitle(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Files without UIDs (most CSVs) get a synthetic one from date + title, so
 * importing the same file twice does not create every event twice.
 */
export function syntheticUid(e: ParsedEvent): string {
  const key = `${e.startDate}|${e.allDay ? '' : (e.startsAt?.toISOString() ?? '')}|${normalizeTitle(e.title)}`;
  return `gen:${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}

function dupKey(title: string, startDate: string | null) {
  return `${startDate ?? ''}|${normalizeTitle(title)}`;
}

export function planImport(parsed: ParsedEvent[], existing: ExistingEvent[]): ImportPlan {
  const byUid = new Map(existing.filter((e) => e.externalUid).map((e) => [e.externalUid!, e]));
  const byDup = new Map<string, ExistingEvent>();
  for (const e of existing) byDup.set(dupKey(e.title, e.startDate), e);

  const seen = new Set<string>();
  const items: PlanItem[] = [];
  for (const ev of parsed) {
    const uid = ev.uid ?? syntheticUid(ev);
    // Two rows with the same UID in one file: keep the first, flag the rest.
    if (seen.has(uid)) {
      items.push({ row: ev.row, action: 'duplicate', existingId: null, uid, hash: eventHash(ev), event: ev });
      continue;
    }
    seen.add(uid);
    const hash = eventHash(ev);
    const match = byUid.get(uid);
    if (match) {
      const action: PlanAction = ev.cancelled ? 'cancel' : match.externalHash === hash ? 'unchanged' : 'update';
      items.push({ row: ev.row, action, existingId: match.id, uid, hash, event: ev });
      continue;
    }
    if (ev.cancelled) {
      // Cancelled and never imported: nothing to do.
      items.push({ row: ev.row, action: 'unchanged', existingId: null, uid, hash, event: ev });
      continue;
    }
    const dup = byDup.get(dupKey(ev.title, ev.startDate));
    if (dup) {
      items.push({ row: ev.row, action: 'duplicate', existingId: dup.id, uid, hash, event: ev });
      continue;
    }
    items.push({ row: ev.row, action: 'new', existingId: null, uid, hash, event: ev });
  }
  const counts: Record<PlanAction, number> = { new: 0, update: 0, unchanged: 0, duplicate: 0, cancel: 0 };
  for (const i of items) counts[i.action]++;
  return { items, counts };
}
