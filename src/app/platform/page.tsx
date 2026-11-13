import Link from 'next/link';
import { requirePlatformAdmin } from '@/server/request';
import { listSchools, platformCan } from '@/server/services/platform';
import { fmtDate, formatBytes, STATUS_LABEL, statusClass, SUB_LABEL } from './_components/format';

export const metadata = { title: 'Schools' };

export default async function PlatformSchools() {
  const { ctx } = await requirePlatformAdmin();
  const schools = await listSchools(ctx);
  const count = (s: string) => schools.filter((x) => x.status === s).length;
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Schools</h1>
          <p>
            Every school on the platform. You see plans, status and usage here, not school content: that stays private
            to each school.
          </p>
        </div>
        {platformCan(ctx, 'schools.manage') && (
          <Link className="btn btn-primary" href="/platform/schools/new">
            New school
          </Link>
        )}
      </div>
      <dl className="stat-grid">
        <div className="stat">
          <dt>Live</dt>
          <dd>{count('active')}</dd>
        </div>
        <div className="stat">
          <dt>Setting up</dt>
          <dd>{count('onboarding')}</dd>
        </div>
        <div className="stat">
          <dt>Suspended</dt>
          <dd>{count('suspended')}</dd>
        </div>
        <div className="stat">
          <dt>Files stored</dt>
          <dd>{formatBytes(schools.reduce((a, s) => a + s.storageBytes, 0))}</dd>
        </div>
      </dl>
      <section className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">School</th>
                <th scope="col">Status</th>
                <th scope="col">Plan</th>
                <th scope="col">Staff</th>
                <th scope="col">Families</th>
                <th scope="col">Files</th>
              </tr>
            </thead>
            <tbody>
              {schools.map((s) => (
                <tr key={s.id}>
                  <th scope="row">
                    <Link href={`/platform/schools/${s.id}`}>{s.name}</Link>
                    <div className="muted" style={{ fontSize: '0.8rem', fontWeight: 400 }}>
                      {s.slug}
                    </div>
                  </th>
                  <td>
                    <span className={statusClass(s.status)}>{STATUS_LABEL[s.status] ?? s.status}</span>
                  </td>
                  <td>
                    {s.planName ?? '—'}
                    <div className="muted" style={{ fontSize: '0.8rem' }}>
                      {s.subscriptionStatus ? SUB_LABEL[s.subscriptionStatus] : ''}
                      {s.subscriptionStatus === 'trialing' && s.trialEndsAt ? ` until ${fmtDate(s.trialEndsAt)}` : ''}
                    </div>
                  </td>
                  <td>{s.staff}</td>
                  <td>{s.families}</td>
                  <td className="nowrap">{formatBytes(s.storageBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
