import { notFound } from 'next/navigation';
import { requireStaff } from '@/server/request';
import { can, hasAnywhere } from '@/server/rbac/authorize';
import { listRoleOptions, listStaff } from '@/server/services/staff';
import { formatInstant } from '../announcements/shared';
import { ActionButton } from '../design/action-button';
import { addRoleAction, inviteAction, removeAction, removeRoleAction, revokeInviteAction, suspendAction } from './actions';
import { AddRoleForm, ConfirmButton, InviteForm } from './forms';

export const metadata = { title: 'Staff' };

type Props = { params: Promise<{ tenant: string }> };

export default async function StaffPage({ params }: Props) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'users.view')) notFound();
  const [{ members, invitations, seats }, opts] = await Promise.all([listStaff(ctx), listRoleOptions(tenant.id)]);
  const tz = tenant.timezone;
  const canInvite = can(ctx, 'users.invite');
  const canAssign = can(ctx, 'roles.assign');
  const canSuspend = can(ctx, 'users.suspend');
  const canRemove = can(ctx, 'users.remove');
  const scopeName = (t: string, id: string | null) =>
    t === 'grade' ? opts.grades.find((g) => g.id === id)?.name : t === 'audience' ? opts.audiences.find((a) => a.id === id)?.name : null;

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Staff</h1>
          <p>
            Who can sign in to manage this portal, and what each person can do. Changes apply on their next page load.
            {seats.limit !== null && ` Your plan includes ${seats.limit} staff accounts; ${seats.used} are in use or invited.`}
          </p>
        </div>
      </div>

      {canInvite && (
        <section className="panel" aria-labelledby="invite-title">
          <div className="panel-head">
            <h2 id="invite-title">Invite someone</h2>
          </div>
          <div className="panel-body">
            <InviteForm run={inviteAction.bind(null, key)} roles={opts.roles} grades={opts.grades} audiences={opts.audiences} />
          </div>
        </section>
      )}

      {invitations.length > 0 && (
        <section className="panel" aria-labelledby="pending-title">
          <div className="panel-head">
            <h2 id="pending-title">Pending invitations</h2>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Role</th>
                  <th scope="col">Expires</th>
                  <th scope="col">
                    <span className="visually-hidden">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.name}</strong>
                      <div className="muted">{i.email}</div>
                    </td>
                    <td>
                      {i.roleName}
                      {scopeName(i.scopeType, i.scopeId) && <div className="muted">Only {scopeName(i.scopeType, i.scopeId)}</div>}
                    </td>
                    <td className="nowrap">{i.expired ? <span className="status status-archived">Expired</span> : formatInstant(i.expiresAt, tz)}</td>
                    <td>{canInvite && <ActionButton run={revokeInviteAction.bind(null, key, i.id)} label="Cancel" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="panel-body muted" style={{ margin: 0 }}>
            Lost the link? Cancel the invitation and create a new one.
          </p>
        </section>
      )}

      <section className="panel" aria-labelledby="members-title">
        <div className="panel-head">
          <h2 id="members-title">Team</h2>
        </div>
        <ul className="member-list">
          {members.map((m) => {
            const self = m.userId === ctx.userId;
            return (
              <li key={m.id} className={m.status === 'suspended' ? 'member member-off' : 'member'}>
                <div className="member-head">
                  <div>
                    <strong>{m.name}</strong> {self && <span className="muted">(you)</span>}
                    {m.status === 'suspended' && <span className="status status-archived"> Suspended</span>}
                    <div className="muted">
                      {m.email}
                      {m.title && ` · ${m.title}`}
                    </div>
                  </div>
                  {!self && (
                    <div className="inline-action">
                      {canSuspend && (
                        <ConfirmButton
                          run={suspendAction.bind(null, key, m.id, m.status !== 'suspended')}
                          label={m.status === 'suspended' ? 'Restore access' : 'Suspend'}
                          confirmLabel={m.status === 'suspended' ? 'Confirm restore' : 'Confirm suspend'}
                        />
                      )}
                      {canRemove && <ConfirmButton run={removeAction.bind(null, key, m.id)} label="Remove" confirmLabel="Remove from school" danger />}
                    </div>
                  )}
                </div>
                <ul className="role-chips" aria-label={`Roles of ${m.name}`}>
                  {m.grants.length === 0 && <li className="muted">No roles: cannot do anything yet.</li>}
                  {m.grants.map((g) => (
                    <li key={g.id} className="role-chip">
                      <span>
                        {g.roleName}
                        {scopeName(g.scopeType, g.scopeId) && <span className="muted"> · only {scopeName(g.scopeType, g.scopeId)}</span>}
                      </span>
                      {canAssign && (
                        <ActionButton
                          run={removeRoleAction.bind(null, key, g.id)}
                          label="×"
                          className="chip-x"
                          ariaLabel={`Remove role ${g.roleName} from ${m.name}`}
                        />
                      )}
                    </li>
                  ))}
                </ul>
                {canAssign && (
                  <AddRoleForm
                    idPrefix={`m-${m.id}`}
                    run={addRoleAction.bind(null, key, m.id)}
                    roles={opts.roles}
                    grades={opts.grades}
                    audiences={opts.audiences}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
