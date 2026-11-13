import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePlatformAdmin } from '@/server/request';
import { getSchool, listPlans, platformCan } from '@/server/services/platform';
import { MODULES } from '@/server/modules/registry';
import { fmtDate, formatBytes, STATUS_LABEL, statusClass, SUB_LABEL } from '../../_components/format';
import { ACTION_LABEL } from '../../_components/activity';
import { OwnerInviteForm, RevokeButton, StatusForm, SubscriptionForm } from './forms';
import { ownerInviteAction, revokeInviteAction, statusAction, subscriptionAction } from './actions';

export const metadata = { title: 'School' };

const isoDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');

export default async function SchoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requirePlatformAdmin();
  const school = await getSchool(ctx, id);
  if (!school) notFound();
  const { tenant: t, subscription: sub, plan } = school;
  const manage = platformCan(ctx, 'schools.manage');
  const plans = manage ? await listPlans() : [];
  const portal = school.domains.find((d) => d.isPrimary && d.verifiedAt)?.hostname;
  const portalHref = portal ? `https://${portal}` : `/s/${t.slug}`;

  return (
    <>
      <p className="muted" style={{ marginBottom: 'var(--space-2)' }}>
        <Link href="/platform">All schools</Link>
      </p>
      <div className="admin-head">
        <div>
          <h1>{t.name}</h1>
          <p>
            <span className={statusClass(t.status)}>{STATUS_LABEL[t.status] ?? t.status}</span> · {t.slug} · {t.timezone} ·
            created {fmtDate(t.createdAt)}
          </p>
          {t.status === 'suspended' && t.suspendedReason && <p className="muted">Suspended: {t.suspendedReason}</p>}
        </div>
        <a className="btn btn-quiet" href={portalHref} target="_blank" rel="noopener">
          Open portal
        </a>
      </div>

      <dl className="stat-grid">
        <div className="stat">
          <dt>Plan</dt>
          <dd>{plan?.name ?? '—'}</dd>
        </div>
        <div className="stat">
          <dt>Billing</dt>
          <dd>
            {sub ? SUB_LABEL[sub.status] : '—'}
            {sub?.status === 'trialing' && sub.trialEndsAt && <span className="muted" style={{ fontSize: '0.8rem', fontWeight: 400 }}> until {fmtDate(sub.trialEndsAt)}</span>}
          </dd>
        </div>
        <div className="stat">
          <dt>Documents</dt>
          <dd>{school.usage.documents}</dd>
        </div>
        <div className="stat">
          <dt>Files stored</dt>
          <dd>
            {formatBytes(school.usage.storageBytes)}
            {plan && <span className="muted" style={{ fontSize: '0.8rem', fontWeight: 400 }}> of {formatBytes(plan.storageLimitMb * 1024 * 1024)}</span>}
          </dd>
        </div>
      </dl>

      <section className="panel" aria-labelledby="owners-title">
        <div className="panel-head">
          <h2 id="owners-title">School owners</h2>
        </div>
        <div className="panel-body form">
          {school.owners.length === 0 ? (
            <p className="muted">Nobody has accepted an owner invitation yet.</p>
          ) : (
            <ul className="member-list">
              {school.owners.map((o) => (
                <li key={o.email} className="member">
                  <div>
                    <strong>{o.name}</strong> <span className="muted">{o.email}</span>
                    {o.status !== 'active' && <span className="status status-archived"> {o.status}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {school.ownerInvites.length > 0 && (
            <>
              <h3 style={{ fontSize: '0.95rem' }}>Pending owner invitations</h3>
              <ul className="member-list">
                {school.ownerInvites.map((i) => (
                  <li key={i.id} className="member">
                    <div>
                      <strong>{i.name}</strong> <span className="muted">{i.email}</span>{' '}
                      <span className="muted">· {i.expired ? 'expired' : `expires ${fmtDate(i.expiresAt)}`}</span>
                    </div>
                    {manage && <RevokeButton run={revokeInviteAction.bind(null, t.id, i.id)} />}
                  </li>
                ))}
              </ul>
            </>
          )}
          {manage && (
            <>
              <h3 style={{ fontSize: '0.95rem' }}>Invite an owner</h3>
              <p className="muted">
                For the first administrator, or to recover a school whose owners have left. The person gets full control
                of the school.
              </p>
              <OwnerInviteForm run={ownerInviteAction.bind(null, t.id)} />
            </>
          )}
        </div>
      </section>

      {manage && (
        <section className="panel" aria-labelledby="status-title">
          <div className="panel-head">
            <h2 id="status-title">Status</h2>
          </div>
          <div className="panel-body">
            {t.status === 'onboarding' && (
              <StatusForm
                key="launch"
                run={statusAction.bind(null, t.id, 'launch')}
                label="Launch school"
                help="The portal already works at its address while setting up. Launching marks it live; it needs an owner who has accepted."
              />
            )}
            {t.status === 'suspended' ? (
              <StatusForm key="reactivate" run={statusAction.bind(null, t.id, 'reactivate')} label="Reactivate school" help="Families and staff get access again." />
            ) : (
              <StatusForm
                key="suspend"
                run={statusAction.bind(null, t.id, 'suspend')}
                label="Suspend school"
                danger
                needsReason
                help="Families and staff lose access; the portal shows “temporarily unavailable”. Nothing is deleted."
              />
            )}
          </div>
        </section>
      )}

      {manage && sub && (
        <section className="panel" aria-labelledby="plan-title">
          <div className="panel-head">
            <h2 id="plan-title">Plan and modules</h2>
          </div>
          <div className="panel-body">
            <SubscriptionForm
              run={subscriptionAction.bind(null, t.id)}
              plans={plans.map((p) => ({ id: p.id, name: p.name, includedModules: p.includedModules }))}
              modules={MODULES.filter((m) => m.implemented && !m.required).map((m) => ({ id: m.id, name: m.name }))}
              current={{ planId: sub.planId, status: sub.status, extraModules: sub.extraModules, trialEndsAt: isoDate(sub.trialEndsAt), renewsAt: isoDate(sub.renewsAt) }}
            />
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="domains-title">
        <div className="panel-head">
          <h2 id="domains-title">Addresses</h2>
        </div>
        <div className="panel-body">
          <ul>
            <li>
              <code>/s/{t.slug}</code> on the platform address
            </li>
            {school.domains.map((d) => (
              <li key={d.id}>
                <code>{d.hostname}</code> · {d.kind === 'subdomain' ? 'platform subdomain' : 'custom domain'}
                {d.verifiedAt ? '' : ' · not verified'}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel" aria-labelledby="activity-title">
        <div className="panel-head">
          <h2 id="activity-title">Platform activity for this school</h2>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">What</th>
                <th scope="col">Who</th>
              </tr>
            </thead>
            <tbody>
              {school.activity.map((a) => (
                <tr key={a.id}>
                  <td className="nowrap">{a.createdAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC</td>
                  <td>{ACTION_LABEL[a.action] ?? a.action}</td>
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
