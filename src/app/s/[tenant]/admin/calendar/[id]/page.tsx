import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { AuthorizationError, hasAnywhere } from '@/server/rbac/authorize';
import { ValidationError } from '@/server/services/modules';
import {
  getContentSettings,
  getEventForStaff,
  listAudiences,
  listCalendars,
  listEventCategories,
} from '@/server/services/calendar';
import { availableTransitions } from '@/server/services/workflow';
import { toDateStr, toTimeStr } from '@/server/calendar/time';
import { describeRrule } from '@/lib/when';
import { EventForm } from '../event-form';
import { CalendarModuleGate, eventWhen, StatusBadge } from '../shared';
import { DeleteEvent, WorkflowActions } from './workflow';

export const metadata = { title: 'Edit event' };

type Props = { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ saved?: string }> };

export default async function EditEventPage({ params, searchParams }: Props) {
  const { tenant: key, id } = await params;
  const { tenant, ctx } = await requireStaff(key);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const base = await tenantBase(key);
  let ev;
  try {
    ev = await getEventForStaff(ctx, id);
  } catch (err) {
    if (err instanceof ValidationError || err instanceof AuthorizationError) notFound();
    throw err;
  }
  const sp = await searchParams;
  const [cals, auds, cats, settings] = await Promise.all([
    listCalendars(tenant.id),
    listAudiences(tenant.id),
    listEventCategories(tenant.id),
    getContentSettings(tenant.id),
  ]);

  // Offer only the transitions that make sense now; the server re-checks each one.
  const actions = availableTransitions((perm) => hasAnywhere(ctx, perm), 'events', ev.status, settings);

  const canEdit = hasAnywhere(ctx, 'events.edit') && ev.status !== 'archived';
  const allDayEnd = ev.allDay ? (ev.endDate !== ev.startDate ? ev.endDate! : '') : '';
  const timedEnd = !ev.allDay && ev.endsAt ? toDateStr(ev.endsAt, ev.timezone) : '';
  const startDate = ev.allDay ? ev.startDate! : toDateStr(ev.startsAt!, ev.timezone);

  return (
    <CalendarModuleGate tenantId={tenant.id} base={base}>
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/calendar`}>← Calendar &amp; Events</Link>
          </p>
          <h1>{ev.title}</h1>
          <p>
            <StatusBadge status={ev.status} /> {eventWhen(ev)}
            {ev.rrule && ` · ${describeRrule(ev.rrule)}`}
          </p>
        </div>
        <WorkflowActions tenantKey={key} eventId={ev.id} actions={actions} />
      </div>
      {sp.saved && <div className="notice notice-ok">Saved.</div>}
      {ev.externalUid && (
        <div className="notice">
          This event came from an import. If you import the same file again and this event changed there, the import will update it.
        </div>
      )}
      <section className="panel">
        <div className="panel-body">
          {canEdit ? (
            <EventForm
              tenantKey={key}
              eventId={ev.id}
              calendars={cals}
              audiences={auds}
              categories={cats}
              canPublish={hasAnywhere(ctx, 'events.publish')}
              requireApproval={settings.requireApproval}
              status={ev.status}
              defaults={{
                calendarId: ev.calendarId,
                title: ev.title,
                description: ev.description ?? '',
                location: ev.location ?? '',
                category: ev.category ?? '',
                allDay: ev.allDay,
                startDate,
                endDate: ev.allDay ? allDayEnd : timedEnd !== startDate ? timedEnd : '',
                startTime: ev.startsAt ? toTimeStr(ev.startsAt, ev.timezone) : '08:00',
                endTime: ev.endsAt && ev.endsAt.getTime() !== ev.startsAt?.getTime() ? toTimeStr(ev.endsAt, ev.timezone) : '',
                timezone: ev.timezone,
                rrule: ev.rrule ?? '',
                exdates: ev.exdates.join(', '),
                registrationUrl: ev.registrationUrl ?? '',
                audienceIds: ev.audienceIds,
                isImportant: ev.isImportant,
              }}
            />
          ) : (
            <p className="muted">{ev.status === 'archived' ? 'Archived events cannot be edited. Restore it first.' : 'You can view this event but not edit it.'}</p>
          )}
        </div>
      </section>
      {hasAnywhere(ctx, 'events.delete') && (
        <section className="panel">
          <div className="panel-body">
            <DeleteEvent tenantKey={key} eventId={ev.id} title={ev.title} />
          </div>
        </section>
      )}
    </CalendarModuleGate>
  );
}
