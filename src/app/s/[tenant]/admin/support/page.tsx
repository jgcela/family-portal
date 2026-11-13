import { notFound } from 'next/navigation';
import { requireStaff } from '@/server/request';
import { can } from '@/server/rbac/authorize';
import { listSupportGrants, SUPPORT_SCOPES, type SupportScope } from '@/server/services/support';
import { supportDecisionAction } from './actions';
import { DecisionButton } from './buttons';

export const metadata = { title: 'Support access' };

const STATE_LABEL = { pending: 'Waiting for you', active: 'Active', declined: 'Declined', revoked: 'Ended', expired: 'Expired' } as const;

export default async function SupportAccessPage({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (ctx.support || !can(ctx, 'support.grant')) notFound();
  const grants = await listSupportGrants(ctx);
  const fmt = (d: Date) => d.toLocaleString('en-US', { timeZone: tenant.timezone, dateStyle: 'medium', timeStyle: 'short' });
  const open = grants.filter((g) => g.state === 'pending' || g.state === 'active');
  const past = grants.filter((g) => g.state !== 'pending' && g.state !== 'active');
  const Row = ({ g }: { g: (typeof grants)[number] }) => (
    <li className="member">
      <div className="member-head">
        <div>
          <strong>{g.requester?.name ?? 'Platform staff'}</strong> <span className="muted">{g.requester?.email}</span>{' '}
          <span className={`status ${g.state === 'active' ? 'status-published' : g.state === 'pending' ? 'status-in_review' : 'status-archived'}`}>{STATE_LABEL[g.state]}</span>
        </div>
      </div>
      <p className="request-note">“{g.reason}”</p>
      <p className="muted" style={{ fontSize: '0.875rem' }}>
        Can see: {g.scopes.map((s) => SUPPORT_SCOPES[s as SupportScope]?.label ?? s).join(' and ')} · read-only · {g.state === 'pending' || g.state === 'active' ? 'until' : 'ended or ran until'} {fmt(g.revokedAt ?? g.expiresAt)}
      </p>
      {g.state === 'pending' && (
        <div className="inline-action">
          <DecisionButton run={supportDecisionAction.bind(null, key, g.id, 'approve')} label="Approve" kind="primary" />
          <DecisionButton run={supportDecisionAction.bind(null, key, g.id, 'decline')} label="Decline" />
        </div>
      )}
      {g.state === 'active' && <DecisionButton run={supportDecisionAction.bind(null, key, g.id, 'revoke')} label="End access now" kind="danger" />}
    </li>
  );
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Support access</h1>
          <p>
            The platform team cannot see your dashboard unless you approve it here. Access is read-only, limited to the
            areas listed, ends on its own at the time shown, and you can end it at any moment. Everything is recorded in
            your activity log.
          </p>
        </div>
      </div>
      <section className="panel" aria-labelledby="open-title">
        <div className="panel-head">
          <h2 id="open-title">Requests and active access</h2>
        </div>
        {open.length === 0 ? (
          <p className="panel-body muted">No one from the platform has asked for access.</p>
        ) : (
          <ul className="member-list">
            {open.map((g) => (
              <Row key={g.id} g={g} />
            ))}
          </ul>
        )}
      </section>
      {past.length > 0 && (
        <section className="panel" aria-labelledby="past-title">
          <div className="panel-head">
            <h2 id="past-title">Past requests</h2>
          </div>
          <ul className="member-list">
            {past.map((g) => (
              <Row key={g.id} g={g} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
