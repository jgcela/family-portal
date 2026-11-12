import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { getContentSettings, listAudiences, listCalendars, listEventCategories } from '@/server/services/calendar';
import { toDateStr } from '@/server/calendar/time';
import { EventForm } from '../event-form';
import { CalendarModuleGate } from '../shared';

export const metadata = { title: 'New event' };

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ date?: string }> };

export default async function NewEventPage({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'events.create')) notFound();
  const base = await tenantBase(key);
  const sp = await searchParams;
  const [cals, auds, cats, settings] = await Promise.all([
    listCalendars(tenant.id),
    listAudiences(tenant.id),
    listEventCategories(tenant.id),
    getContentSettings(tenant.id),
  ]);
  const today = toDateStr(new Date(), tenant.timezone);
  return (
    <CalendarModuleGate tenantId={tenant.id} base={base}>
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/calendar`}>← Calendar &amp; Events</Link>
          </p>
          <h1>New event</h1>
        </div>
      </div>
      {cals.length === 0 ? (
        <div className="notice">Create a calendar first.</div>
      ) : (
        <section className="panel">
          <div className="panel-body">
            <EventForm
              tenantKey={key}
              eventId={null}
              calendars={cals}
              audiences={auds}
              categories={cats}
              canPublish={hasAnywhere(ctx, 'events.publish')}
              requireApproval={settings.requireApproval}
              status={null}
              defaults={{
                calendarId: cals[0]!.id,
                title: '',
                description: '',
                location: '',
                category: '',
                allDay: false,
                startDate: sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today,
                endDate: '',
                startTime: '08:00',
                endTime: '',
                timezone: tenant.timezone,
                rrule: '',
                exdates: '',
                registrationUrl: '',
                audienceIds: [],
                isImportant: false,
              }}
            />
          </div>
        </section>
      )}
    </CalendarModuleGate>
  );
}
