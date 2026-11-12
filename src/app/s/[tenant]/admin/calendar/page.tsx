import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { listAudiences, listCalendars, listEventsForStaff } from '@/server/services/calendar';
import { describeRrule } from '@/lib/when';
import { CalendarModuleGate, eventWhen, StatusBadge, STATUS_LABEL } from './shared';

export const metadata = { title: 'Calendar & Events' };

type Props = {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ calendar?: string; status?: string; q?: string; deleted?: string }>;
};

export default async function CalendarAdminPage({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'events.view')) notFound();
  const sp = await searchParams;
  const base = await tenantBase(key);
  const a = `${base}/admin/calendar`;
  const status = sp.status && sp.status in STATUS_LABEL ? (sp.status as keyof typeof STATUS_LABEL) : undefined;
  const [cals, auds, rows] = await Promise.all([
    listCalendars(tenant.id),
    listAudiences(tenant.id),
    listEventsForStaff(ctx, { calendarId: cals0(sp.calendar), status, q: sp.q?.slice(0, 100) }),
  ]);
  const calById = new Map(cals.map((c) => [c.id, c]));
  const audById = new Map(auds.map((x) => [x.id, x.name]));

  return (
    <CalendarModuleGate tenantId={tenant.id} base={base}>
      <div className="admin-head">
        <div>
          <h1>Calendar &amp; Events</h1>
          <p>Events families see on the portal calendar, in This Week, and in calendar subscriptions.</p>
        </div>
        <div className="form-actions">
          {hasAnywhere(ctx, 'calendars.manage') && (
            <Link className="btn btn-quiet btn-sm" href={`${a}/calendars`}>
              Calendars
            </Link>
          )}
          {hasAnywhere(ctx, 'events.import') && (
            <Link className="btn btn-quiet btn-sm" href={`${a}/import`}>
              Import events
            </Link>
          )}
          {hasAnywhere(ctx, 'events.create') && (
            <Link className="btn btn-primary btn-sm" href={`${a}/new`}>
              New event
            </Link>
          )}
        </div>
      </div>
      {sp.deleted && <div className="notice notice-ok">Event deleted.</div>}
      <section className="panel" aria-labelledby="events-title">
        <h2 id="events-title" className="visually-hidden">
          Events
        </h2>
        <form className="filters" method="get" role="search">
          <div className="field">
            <label htmlFor="f-q">Search</label>
            <input id="f-q" name="q" type="search" defaultValue={sp.q ?? ''} placeholder="Title or place" />
          </div>
          <div className="field">
            <label htmlFor="f-cal">Calendar</label>
            <select id="f-cal" name="calendar" defaultValue={sp.calendar ?? ''}>
              <option value="">All calendars</option>
              {cals.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-status">Status</label>
            <select id="f-status" name="status" defaultValue={status ?? ''}>
              <option value="">Any status</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-quiet btn-sm" type="submit">
            Filter
          </button>
          {(sp.q || sp.calendar || status) && (
            <Link href={a} className="btn-sm">
              Clear filters
            </Link>
          )}
        </form>
        {rows.length === 0 ? (
          <div className="panel-body">
            <p>{sp.q || sp.calendar || status ? 'No events match these filters.' : 'No events yet.'}</p>
            {!sp.q && !sp.calendar && !status && (
              <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
                Create your first event, or import your school calendar from Google Calendar (.ics) or a spreadsheet (.csv).
              </p>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">When</th>
                  <th scope="col">Calendar</th>
                  <th scope="col">For</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const cal = calById.get(e.calendarId);
                  return (
                    <tr key={e.id}>
                      <td className="cell-title">
                        <Link href={`${a}/${e.id}`}>{e.title}</Link>
                        {e.rrule && <div className="muted">{describeRrule(e.rrule)}</div>}
                      </td>
                      <td className="nowrap">{eventWhen(e)}</td>
                      <td className="nowrap">
                        {cal && <span className="swatch" style={{ background: cal.color }} aria-hidden="true" />}
                        {cal?.name}
                      </td>
                      <td className="muted">{e.audienceIds.length ? e.audienceIds.map((id) => audById.get(id) ?? '?').join(', ') : 'Whole school'}</td>
                      <td>
                        <StatusBadge status={e.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </CalendarModuleGate>
  );
}

function cals0(v: string | undefined) {
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined;
}
