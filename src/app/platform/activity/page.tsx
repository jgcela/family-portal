import Link from 'next/link';
import { requirePlatformAdmin } from '@/server/request';
import { listPlatformActivity } from '@/server/services/platform';
import { ACTION_LABEL } from '../_components/activity';

export const metadata = { title: 'Activity log' };

export default async function ActivityPage() {
  const { ctx } = await requirePlatformAdmin();
  const rows = await listPlatformActivity(ctx, 200);
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Activity log</h1>
          <p>Everything done from the platform: schools created, launched, suspended, plans changed and owners invited. The latest 200 entries.</p>
        </div>
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">When (UTC)</th>
                <th scope="col">School</th>
                <th scope="col">What</th>
                <th scope="col">Who</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    Nothing yet.
                  </td>
                </tr>
              )}
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="nowrap">{a.createdAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })}</td>
                  <td>{a.tenantId ? <Link href={`/platform/schools/${a.tenantId}`}>{a.school}</Link> : '—'}</td>
                  <td>
                    {ACTION_LABEL[a.action] ?? a.action}
                    {typeof (a.metadata as { reason?: unknown }).reason === 'string' && (
                      <div className="muted" style={{ fontSize: '0.8rem' }}>
                        {(a.metadata as { reason: string }).reason}
                      </div>
                    )}
                  </td>
                  <td>{a.actor ?? (a.actorKind === 'system' ? 'System' : '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
