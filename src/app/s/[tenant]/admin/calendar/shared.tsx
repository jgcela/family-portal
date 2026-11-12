import Link from 'next/link';
import { getModuleState } from '@/server/services/modules';
import { toDateStr } from '@/server/calendar/time';
import { formatRange } from '@/lib/when';

type EventLike = {
  allDay: boolean;
  startDate: string | null;
  endDate: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string;
};

export function eventWhen(e: EventLike) {
  const date = e.allDay ? e.startDate! : toDateStr(e.startsAt!, e.timezone);
  const endDate = e.allDay ? (e.endDate ?? date) : toDateStr(e.endsAt ?? e.startsAt!, e.timezone);
  return formatRange({ allDay: e.allDay, date, endDate, start: e.startsAt, end: e.endsAt }, e.timezone);
}

export const STATUS_LABEL = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  published: 'Published',
  archived: 'Archived',
} as const;

export function StatusBadge({ status }: { status: keyof typeof STATUS_LABEL }) {
  return <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>;
}

/** Shown instead of the calendar tools when the module is off for this school. */
export async function CalendarModuleGate({ tenantId, base, children }: { tenantId: string; base: string; children: React.ReactNode }) {
  const state = await getModuleState(tenantId);
  if (state.active.some((m) => m.id === 'calendar')) return <>{children}</>;
  return (
    <div className="notice">
      Calendar &amp; Events is turned off for your school. Turn it on in the <Link href={`${base}/admin/modules`}>Module Manager</Link>.
    </div>
  );
}
