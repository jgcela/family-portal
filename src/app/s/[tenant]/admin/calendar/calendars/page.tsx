import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { listCalendars } from '@/server/services/calendar';
import { CalendarModuleGate } from '../shared';
import { CalendarForm } from './calendar-form';

export const metadata = { title: 'Calendars' };

type Props = { params: Promise<{ tenant: string }> };

export default async function CalendarsPage({ params }: Props) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'calendars.manage')) notFound();
  const base = await tenantBase(key);
  const cals = await listCalendars(tenant.id);
  return (
    <CalendarModuleGate tenantId={tenant.id} base={base}>
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/calendar`}>← Calendar &amp; Events</Link>
          </p>
          <h1>Calendars</h1>
          <p>Group events into calendars (for example School, Athletics, Parish). Families can filter by calendar and subscribe to each one.</p>
        </div>
      </div>
      {cals.map((c) => (
        <section className="panel" key={c.id} aria-labelledby={`cal-${c.id}`}>
          <div className="panel-head">
            <h2 id={`cal-${c.id}`}>
              <span className="swatch" style={{ background: c.color }} aria-hidden="true" />
              {c.name}
            </h2>
            {c.isPublic ? (
              <span className="muted">
                Subscription link: <code>{`${base}/calendar/feed/${c.key}.ics`}</code>
              </span>
            ) : (
              <span className="badge">Staff only</span>
            )}
          </div>
          <div className="panel-body">
            <CalendarForm tenantKey={key} cal={c} />
          </div>
        </section>
      ))}
      <section className="panel" aria-labelledby="new-cal">
        <div className="panel-head">
          <h2 id="new-cal">Add a calendar</h2>
        </div>
        <div className="panel-body">
          <CalendarForm tenantKey={key} cal={null} />
        </div>
      </section>
    </CalendarModuleGate>
  );
}
