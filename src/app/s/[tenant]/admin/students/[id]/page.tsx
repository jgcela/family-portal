import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc } from 'drizzle-orm';
import { requireStaff, tenantBase } from '@/server/request';
import { can } from '@/server/rbac/authorize';
import { withTenant } from '@/server/db/client';
import { grades } from '@/server/db/schema';
import { familyAccountsForLinking, getStudent } from '@/server/services/students';
import { ValidationError } from '@/server/errors';
import { AuthorizationError } from '@/server/rbac/authorize';
import { ConfirmButton } from '../../staff/forms';
import { removeGuardianAction, setGuardianAction } from '../../_ops/actions';
import { OpsForm } from '../../_ops/forms';
import { StudentForm } from '../shared';

export const metadata = { title: 'Student' };
export const dynamic = 'force-dynamic';

function GuardianFields({ prefix, d }: { prefix: string; d?: { relationship: string; access: string; canSubmitAttendance: boolean; canViewStudent: boolean; restrictionNote: string | null } }) {
  return (
    <>
      <div className="form-row">
        <div className="field">
          <label htmlFor={`${prefix}-rel`}>Relationship</label>
          <input id={`${prefix}-rel`} name="relationship" defaultValue={d?.relationship ?? 'Parent/guardian'} maxLength={40} />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-access`}>Access</label>
          <select id={`${prefix}-access`} name="access" defaultValue={d?.access ?? 'active'}>
            <option value="active">Active</option>
            <option value="restricted">Restricted: no access to this child</option>
          </select>
        </div>
      </div>
      <div className="check-grid">
        <label className="check">
          <input type="checkbox" name="canSubmitAttendance" defaultChecked={d?.canSubmitAttendance ?? true} /> Can report absences
        </label>
        <label className="check">
          <input type="checkbox" name="canViewStudent" defaultChecked={d?.canViewStudent ?? true} /> Can see this child in the portal
        </label>
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-note`}>Restriction note (staff only; required when restricted)</label>
        <textarea id={`${prefix}-note`} name="restrictionNote" defaultValue={d?.restrictionNote ?? ''} maxLength={500} rows={2} />
      </div>
    </>
  );
}

export default async function StudentPage({ params, searchParams }: { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { tenant: key, id } = await params;
  const sp = await searchParams;
  const { tenant, ctx } = await requireStaff(key);
  const d = await getStudent(ctx, id).catch((err) => {
    if (err instanceof ValidationError || err instanceof AuthorizationError) return null;
    throw err;
  });
  if (!d) notFound();
  const a = `${await tenantBase(key)}/admin`;
  const canManage = can(ctx, 'students.manage') && !ctx.support;
  const [gradeRows, families] = await Promise.all([
    withTenant(tenant.id, (tx) => tx.select({ id: grades.id, name: grades.name }).from(grades).orderBy(asc(grades.sortOrder))),
    canManage ? familyAccountsForLinking(ctx) : Promise.resolve([]),
  ]);
  const linked = new Set(d.guardians.map((g) => g.membershipId));
  const s = d.student;
  return (
    <>
      <p>
        <Link href={`${a}/students`}>← Students</Link>
      </p>
      <div className="admin-head">
        <div>
          <h1>
            {s.preferredName || s.firstName} {s.lastName}
          </h1>
          <p>{s.gradeId ? gradeRows.find((g) => g.id === s.gradeId)?.name : 'No grade'}{s.status === 'inactive' ? ' · inactive' : ''}</p>
        </div>
      </div>
      {sp.created && <div className="notice notice-ok">Student added. Link the family accounts below.</div>}
      {canManage && (
        <section className="panel">
          <div className="panel-head">
            <h2>Details</h2>
          </div>
          <div className="panel-body">
            <StudentForm tenantKey={key} student={s} grades={gradeRows} />
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-head">
          <h2>Linked family accounts</h2>
        </div>
        {d.guardians.length === 0 ? (
          <p className="panel-body muted">No family account is linked. The family can&apos;t report absences for this student yet.</p>
        ) : (
          d.guardians.map((g) => (
            <div className="panel-body" key={g.membershipId} style={{ borderBottom: '1px solid var(--border)' }}>
              <p>
                <strong>{g.name}</strong> · {g.email} · {g.relationship}
                {g.access === 'restricted' ? <span className="status status-danger"> Restricted</span> : null}
                {g.membershipStatus !== 'active' ? <span className="muted"> · account {g.membershipStatus}</span> : null}
              </p>
              {canManage ? (
                <>
                  <OpsForm action={setGuardianAction.bind(null, key, s.id)} submit="Save link">
                    <input type="hidden" name="membershipId" value={g.membershipId} />
                    <GuardianFields prefix={g.membershipId} d={g} />
                  </OpsForm>
                  <ConfirmButton run={removeGuardianAction.bind(null, key, s.id, g.membershipId)} label="Unlink" confirmLabel="Unlink account" danger />
                </>
              ) : (
                <p className="muted">
                  {g.access === 'restricted' ? 'No access.' : [g.canSubmitAttendance && 'Can report absences', g.canViewStudent && 'Can see this child'].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          ))
        )}
      </section>
      {canManage && (
        <section className="panel">
          <div className="panel-head">
            <h2>Link a family account</h2>
          </div>
          <div className="panel-body">
            {families.filter((f) => !linked.has(f.id)).length === 0 ? (
              <p className="muted">
                All family accounts are already linked, or none exist yet. Families join from the <Link href={`${a}/families`}>Families</Link> page.
              </p>
            ) : (
              <OpsForm action={setGuardianAction.bind(null, key, s.id)} submit="Link account" resetOnOk>
                <div className="field">
                  <label htmlFor="membershipId">Family account</label>
                  <select id="membershipId" name="membershipId" required defaultValue="">
                    <option value="">Choose…</option>
                    {families
                      .filter((f) => !linked.has(f.id))
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.email}){f.status !== 'active' ? ` · ${f.status}` : ''}
                        </option>
                      ))}
                  </select>
                </div>
                <GuardianFields prefix="new" />
              </OpsForm>
            )}
          </div>
        </section>
      )}
    </>
  );
}
