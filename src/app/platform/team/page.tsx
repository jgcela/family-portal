import { requirePlatformAdmin } from '@/server/request';
import { listPlatformTeam } from '@/server/services/platform-ops';
import { addMemberAction, removeMemberAction, roleAction } from './actions';
import { AddMemberForm, RemoveForm, RoleForm } from './forms';

export const metadata = { title: 'Platform team' };

export default async function TeamPage() {
  const { ctx } = await requirePlatformAdmin();
  const team = await listPlatformTeam(ctx);
  const isOwner = ctx.role === 'owner';
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Platform team</h1>
          <p>People who run the platform. These roles never give access to a school’s content; that needs support access approved by the school.</p>
        </div>
      </div>
      <section className="panel">
        <ul className="member-list">
          {team.map((m) => (
            <li key={m.userId} className="member">
              <div className="member-head">
                <div>
                  <strong>{m.name}</strong> <span className="muted">{m.email}</span>{' '}
                  {!m.twoFactor && <span className="status status-in_review">No two-step sign-in</span>}
                </div>
                {isOwner && m.userId !== ctx.userId ? (
                  <div className="inline-action">
                    <RoleForm run={roleAction.bind(null, m.userId)} role={m.role} id={m.userId} />
                    <RemoveForm run={removeMemberAction.bind(null, m.userId)} />
                  </div>
                ) : (
                  <span className="muted">{m.role}{m.userId === ctx.userId ? ' (you)' : ''}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
      {isOwner && (
        <section className="panel" aria-labelledby="add-member">
          <div className="panel-head">
            <h2 id="add-member">Add someone</h2>
          </div>
          <div className="panel-body">
            <AddMemberForm run={addMemberAction} />
          </div>
        </section>
      )}
    </>
  );
}
