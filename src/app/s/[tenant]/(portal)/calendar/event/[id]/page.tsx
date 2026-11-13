import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPortalView, getTenantOr404, tenantBase, getViewer } from '@/server/request';
import { getPublicEvent } from '@/server/services/calendar';
import { expandOccurrences, toDateStr } from '@/server/calendar/time';
import { googleCalendarLink } from '@/server/calendar/ics-export';
import { describeRrule, formatRange } from '@/lib/when';
import { categoryLabel } from '../../event-list';

type Props = { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ date?: string }> };

async function load({ params }: Props) {
  const { tenant: key, id } = await params;
  const tenant = await getTenantOr404(key);
  const view = await getPortalView(tenant.id);
  if (!view.activeModules.some((m) => m.id === 'calendar')) notFound();
  const row = await getPublicEvent(tenant.id, id, await getViewer(tenant.id));
  if (!row) notFound();
  return { tenant, key, row };
}

export async function generateMetadata(props: Props) {
  const { row } = await load(props);
  return { title: row.e.title };
}

export default async function EventPage(props: Props) {
  const { tenant, key, row } = await load(props);
  const { e, c } = row;
  const base = await tenantBase(key);
  const sp = await props.searchParams;
  // For a recurring event, show the occurrence that was clicked (or the next one).
  const first = e.allDay ? e.startDate! : toDateStr(e.startsAt!, e.timezone);
  const wanted = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : first;
  const occ =
    expandOccurrences(e, wanted, wanted).find((o) => o.date === wanted) ??
    expandOccurrences(e, first, first)[0] ?? {
      allDay: e.allDay,
      date: first,
      endDate: e.endDate ?? first,
      start: e.startsAt,
      end: e.endsAt,
    };
  const google = googleCalendarLink({
    title: e.title,
    details: e.description,
    location: e.location,
    allDay: occ.allDay,
    date: occ.date,
    endDate: occ.endDate,
    start: occ.start,
    end: occ.end,
  });
  const backMonth = occ.date.slice(0, 7);

  return (
    <div className="container event-page">
      <p>
        <Link href={`${base}/calendar?month=${backMonth}`}>← Back to calendar</Link>
      </p>
      <article className="card event-card">
        <p className="event-cal">
          <span className="swatch" style={{ background: c.color }} aria-hidden="true" />
          {c.name}
          {e.category && <span className="cat-tag">{categoryLabel(e.category)}</span>}
          {e.isImportant && <span className="badge">Important</span>}
        </p>
        <h1>{e.title}</h1>
        <dl className="event-facts">
          <div>
            <dt>When</dt>
            <dd>
              {formatRange(occ, e.timezone)}
              {e.rrule && <div className="muted">{describeRrule(e.rrule)}</div>}
            </dd>
          </div>
          {e.location && (
            <div>
              <dt>Where</dt>
              <dd>{e.location}</dd>
            </div>
          )}
        </dl>
        {e.description && <div className="event-desc">{e.description}</div>}
        <div className="event-actions">
          {e.registrationUrl && (
            <a className="btn btn-primary" href={e.registrationUrl} rel="noopener noreferrer" target="_blank">
              Sign up / more info
            </a>
          )}
          <a className="btn btn-quiet" href={google} rel="noopener noreferrer" target="_blank">
            Add to Google Calendar
          </a>
          <a className="btn btn-quiet" href={`${base}/calendar/event/${e.id}/ics`}>
            Add to Apple / Outlook
          </a>
        </div>
        <p className="muted event-tz">Times in {tenant.timezone.split('/').pop()!.replace('_', ' ')} time.</p>
      </article>
    </div>
  );
}
