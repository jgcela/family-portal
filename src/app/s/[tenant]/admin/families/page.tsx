import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { can, hasAnywhere } from '@/server/rbac/authorize';
import { getJoinCode, getJoinPageInfo, listFamilies, listFamilyRequests } from '@/server/services/families';
import { formatInstant } from '../announcements/shared';
import { ConfirmButton } from '../staff/forms';
import { approveAction, gradesAction, joinCodeAction, rejectAction, removeFamilyAction, suspendFamilyAction } from './actions';
import { GradesForm } from './forms';

export const metadata = { title: 'Families' };

export default async function FamiliesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'users.view')) notFound();
  const base = await tenantBase(key);
  const canInvite = can(ctx, 'users.invite');
  const [requests, families, info, code] = await Promise.all([
    listFamilyRequests(ctx),
    listFamilies(ctx),
    getJoinPageInfo(tenant.id),
    canInvite ? getJoinCode(ctx) : Promise.resolve(null),
  ]);
  const gradeName = (id: string) => info.grades.find((g) => g.id === id)?.name ?? 'Unknown grade';
  const tz = tenant.timezone;

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Families</h1>
          <p>
            Families sign in to see information for their children&rsquo;s grades. Content marked &ldquo;Families&rdquo; is only
            shown to approved families (all of them, or only the grades you pick on that item).
          </p>
        </div>
      </div>

      {canInvite && (
        <section className="panel" aria-labelledby="code-title">
          <div className="panel-head">
            <h2 id="code-title">How families join</h2>
          </div>
          <div className="panel-body join-code">
            {code ? (
              <>
                <p>
                  Share this code and the link with families (newsletter, office). Anyone with the code can <em>ask</em> for an
                  account; nobody sees family content until you approve them below.
                </p>
                <p className="join-code-value" aria-label="School code">
                  {code}
                </p>
                <p>
                  Link: <Link href={`${base}/join`}>{`${base}/join`}</Link>
                </p>
                <div className="inline-action">
                  <ConfirmButton run={joinCodeAction.bind(null, key, true)} label="Get a new code" confirmLabel="Replace code" />
                  <ConfirmButton run={joinCodeAction.bind(null, key, false)} label="Close joining" confirmLabel="Confirm close" danger />
                </div>
                <p className="hint">A new code stops the old one from working. Requests already sent stay in the list.</p>
              </>
            ) : (
              <>
                <p>Joining is closed. Open it to get a code you can share with families.</p>
                <ConfirmButton run={joinCodeAction.bind(null, key, true)} label="Open joining" confirmLabel="Create code" />
              </>
            )}
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="req-title">
        <div className="panel-head">
          <h2 id="req-title">Requests waiting ({requests.length})</h2>
        </div>
        {requests.length === 0 ? (
          <p className="panel-body muted">No requests right now.</p>
        ) : (
          <ul className="member-list">
            {requests.map((r) => (
              <li key={r.id} className="member">
                <div className="member-main">
                  <p>
                    <strong>{r.name}</strong> <span className="muted">· {r.email} · {formatInstant(r.createdAt, tz)}</span>
                  </p>
                  <p className="request-note">{r.note}</p>
                  <p className="hint">Email not verified yet. Check the note against your records before approving.</p>
                </div>
                {canInvite && (
                  <>
                    <GradesForm run={approveAction.bind(null, key, r.id)} grades={info.grades} selected={r.gradeIds} submitLabel="Approve" />
                    <ConfirmButton run={rejectAction.bind(null, key, r.id)} label="Decline" confirmLabel="Confirm decline" danger />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="fam-title">
        <div className="panel-head">
          <h2 id="fam-title">Families ({families.length})</h2>
        </div>
        {families.length === 0 ? (
          <p className="panel-body muted">No family accounts yet.</p>
        ) : (
          <ul className="member-list">
            {families.map((f) => (
              <li key={f.id} className={f.status === 'suspended' ? 'member member-off' : 'member'}>
                <div className="member-main">
                  <p>
                    <strong>{f.name}</strong> <span className="muted">· {f.email}</span>
                    {f.status === 'suspended' && <span className="status status-archived"> Suspended</span>}
                  </p>
                  {!canInvite && <p className="muted">{f.gradeIds.map(gradeName).join(', ') || 'No grades'}</p>}
                </div>
                {canInvite && <GradesForm run={gradesAction.bind(null, key, f.id)} grades={info.grades} selected={f.gradeIds} submitLabel="Save grades" />}
                <div className="inline-action">
                  {can(ctx, 'users.suspend') && (
                    <ConfirmButton
                      run={suspendFamilyAction.bind(null, key, f.id, f.status !== 'suspended')}
                      label={f.status === 'suspended' ? 'Restore access' : 'Suspend'}
                      confirmLabel={f.status === 'suspended' ? 'Confirm restore' : 'Confirm suspend'}
                    />
                  )}
                  {can(ctx, 'users.remove') && <ConfirmButton run={removeFamilyAction.bind(null, key, f.id)} label="Remove" confirmLabel="Confirm remove" danger />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
