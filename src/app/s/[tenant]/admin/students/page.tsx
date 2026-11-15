import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc } from 'drizzle-orm';
import { requireStaff, tenantBase } from '@/server/request';
import { can } from '@/server/rbac/authorize';
import { getModuleState } from '@/server/services/modules';
import { listStudents } from '@/server/services/students';
import { gradeScope } from '@/server/services/ops-common';
import { withTenant } from '@/server/db/client';
import { grades } from '@/server/db/schema';
import { importStudentsAction } from '../_ops/actions';
import { OpsForm } from '../_ops/forms';

export const metadata = { title: 'Students' };
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ q?: string; grade?: string; inactive?: string }> };

export default async function StudentsPage({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const sp = await searchParams;
  const { tenant, ctx } = await requireStaff(key);
  const st = await getModuleState(tenant.id);
  if (!st.active.some((m) => m.id === 'attendance_notices')) notFound();
  const scope = gradeScope(ctx, 'students.view');
  if (ctx.support || (scope !== 'all' && !scope.length)) notFound();
  const a = `${await tenantBase(key)}/admin`;
  const gradeId = sp.grade && /^[0-9a-f-]{36}$/i.test(sp.grade) ? sp.grade : undefined;
  const [rows, gradeRows] = await Promise.all([
    listStudents(ctx, { q: sp.q, gradeId, includeInactive: sp.inactive === '1' }),
    withTenant(tenant.id, (tx) => tx.select({ id: grades.id, name: grades.name }).from(grades).orderBy(asc(grades.sortOrder))),
  ]);
  const gradeName = new Map(gradeRows.map((g) => [g.id, g.name]));
  const canManage = can(ctx, 'students.manage');
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Students</h1>
          <p>
            Students and the family accounts linked to them. A family can only report absences or ask about a child it is linked to, with the permissions set on
            that link.
          </p>
        </div>
        {canManage && (
          <Link className="btn btn-primary btn-sm" href={`${a}/students/new`}>
            Add student
          </Link>
        )}
      </div>
      <section className="panel">
        <form className="filters" method="get">
          <div className="field">
            <label htmlFor="q">Search</label>
            <input id="q" name="q" defaultValue={sp.q} placeholder="Name or SIS id" />
          </div>
          <div className="field">
            <label htmlFor="grade">Grade</label>
            <select id="grade" name="grade" defaultValue={gradeId ?? ''}>
              <option value="">All</option>
              {gradeRows
                .filter((g) => scope === 'all' || scope.includes(g.id))
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </div>
          <label className="check">
            <input type="checkbox" name="inactive" value="1" defaultChecked={sp.inactive === '1'} /> Include inactive
          </label>
          <button className="btn btn-quiet btn-sm" type="submit">
            Filter
          </button>
        </form>
        {rows.length === 0 ? (
          <div className="panel-body">
            <p className="muted">No students yet.{canManage ? ' Add them one by one or import a CSV below.' : ''}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Grade</th>
                  <th scope="col">Linked accounts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="cell-title">
                      <Link href={`${a}/students/${s.id}`}>
                        {s.lastName}, {s.preferredName || s.firstName}
                      </Link>
                      {s.status === 'inactive' && <span className="muted"> · inactive</span>}
                    </td>
                    <td>{s.gradeId ? gradeName.get(s.gradeId) : <span className="muted">—</span>}</td>
                    <td>
                      {s.guardians === 0 ? <span className="field-error">None</span> : s.guardians}
                      {s.restricted > 0 && <span className="muted"> · {s.restricted} restricted</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {canManage && !ctx.support && (
        <section className="panel" aria-labelledby="import-title">
          <div className="panel-head">
            <h2 id="import-title">Import from a CSV</h2>
          </div>
          <div className="panel-body">
            <p>
              Columns: <code>first_name, last_name, grade, sis_id, guardian_emails</code>. Grade is the grade code or name (K, 1, 2…). Separate several guardian emails
              with a semicolon. Guardians are linked only if they already have an approved family account with that email. Importing never deletes students or
              links, and never changes a restricted link.
            </p>
            <OpsForm action={importStudentsAction.bind(null, key)} submit="Import" resetOnOk>
              <div className="field">
                <label htmlFor="file">CSV file</label>
                <input id="file" name="file" type="file" accept=".csv,text/csv" required />
              </div>
            </OpsForm>
          </div>
        </section>
      )}
    </>
  );
}
