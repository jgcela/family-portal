import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { getContentSettings, listAudiences, listCalendars, listImports } from '@/server/services/calendar';
import { CalendarModuleGate } from '../shared';
import { ImportWizard } from './wizard';

export const metadata = { title: 'Import events' };

type Props = { params: Promise<{ tenant: string }> };

export default async function ImportPage({ params }: Props) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'events.import')) notFound();
  const base = await tenantBase(key);
  const [cals, auds, settings, history] = await Promise.all([
    listCalendars(tenant.id),
    listAudiences(tenant.id),
    getContentSettings(tenant.id),
    listImports(ctx),
  ]);
  const calName = new Map(cals.map((c) => [c.id, c.name]));
  return (
    <CalendarModuleGate tenantId={tenant.id} base={base}>
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/calendar`}>← Calendar &amp; Events</Link>
          </p>
          <h1>Import events</h1>
          <p>
            Bring in events from Google Calendar, Outlook or a spreadsheet. Importing the same file again updates what changed instead of
            creating copies.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-body">
          <ImportWizard
            tenantKey={key}
            base={base}
            calendars={cals.map((c) => ({ id: c.id, name: c.name }))}
            audiences={auds}
            timezone={tenant.timezone}
            canPublish={hasAnywhere(ctx, 'events.publish')}
            requireApproval={settings.requireApproval}
          />
        </div>
      </section>
      {history.length > 0 && (
        <section className="panel" aria-labelledby="history-title">
          <div className="panel-head">
            <h2 id="history-title">Recent imports</h2>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">File</th>
                  <th scope="col">Calendar</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="nowrap">
                      {new Intl.DateTimeFormat('en-US', { timeZone: tenant.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(h.createdAt)}
                    </td>
                    <td>{h.fileName ?? h.sourceKind}</td>
                    <td>{calName.get(h.calendarId)}</td>
                    <td className="muted">
                      {h.status === 'completed' && h.result
                        ? `${h.result.created} created, ${h.result.updated} updated, ${h.result.cancelled} archived, ${h.result.skipped} skipped`
                        : 'Previewed, not imported'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </CalendarModuleGate>
  );
}
