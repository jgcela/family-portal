import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { getModuleState } from '@/server/services/modules';
import { assignableStaff, inboxStats, listInbox, listViews, parseFilters, runEscalations } from '@/server/services/inbox';
import { gradeScope } from '@/server/services/ops-common';
import { withTenant } from '@/server/db/client';
import { grades } from '@/server/db/schema';
import { asc } from 'drizzle-orm';
import { ConfirmButton } from '../staff/forms';
import { bulkAction, deleteViewAction, saveViewAction } from '../_ops/actions';
import { InboxTable, OpsForm } from '../_ops/forms';

export const metadata = { title: 'Inbox' };
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<Record<string, string | undefined>> };

const hours = (h: number | null) => (h === null ? '—' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`);

export default async function InboxPage({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const sp = await searchParams;
  const { tenant, ctx } = await requireStaff(key);
  const st = await getModuleState(tenant.id);
  if (!st.active.some((m) => m.id === 'operations_inbox')) notFound();
  const scope = gradeScope(ctx, 'inbox.view');
  if (ctx.support || (scope !== 'all' && scope.length === 0)) notFound();
  await runEscalations(tenant.id);
  const filters = parseFilters(sp);
  const base = await tenantBase(key);
  const a = `${base}/admin`;
  const [rows, stats, views, staff, gradeRows] = await Promise.all([
    listInbox(ctx, filters),
    inboxStats(ctx),
    listViews(ctx),
    assignableStaff(ctx),
    withTenant(tenant.id, (tx) => tx.select({ id: grades.id, name: grades.name }).from(grades).orderBy(asc(grades.sortOrder))),
  ]);
  const visibleGrades = scope === 'all' ? gradeRows : gradeRows.filter((g) => scope.includes(g.id));
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tenant.timezone });
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== '' && v !== undefined) as [string, string][]).toString();
  const quick = [
    ['Open', 'status=open'],
    ['Mine', 'status=open&assignee=me'],
    ['Unassigned', 'status=open&assignee=none'],
    ['Overdue', 'status=open&overdue=1'],
    ['Attendance', 'status=open&kind=attendance'],
    ['Resolved', 'status=resolved'],
  ];
  const manageScope = gradeScope(ctx, 'inbox.manage');
  const canManage = manageScope === 'all' || manageScope.length > 0;

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Inbox</h1>
          <p>Everything families sent that needs the office: absences, questions and requests. Each one has an owner, a status and its history.</p>
        </div>
        <Link className="btn btn-quiet btn-sm" href={`${a}/inbox/templates`}>
          Reply templates
        </Link>
      </div>
      <dl className="stat-grid">
        <div className="stat">
          <dt>Open</dt>
          <dd>{stats.open}</dd>
        </div>
        <div className="stat">
          <dt>Overdue</dt>
          <dd>{stats.overdue}</dd>
        </div>
        <div className="stat">
          <dt>Assigned to me</dt>
          <dd>{stats.mine}</dd>
        </div>
        <div className="stat">
          <dt>Unassigned</dt>
          <dd>{stats.unassigned}</dd>
        </div>
        <div className="stat">
          <dt>Average time to resolve (30 days)</dt>
          <dd>{hours(stats.avgResolveHours)}</dd>
        </div>
        <div className="stat">
          <dt>Handled by rules (30 days)</dt>
          <dd>
            {stats.automated30d} of {stats.resolved30d}
          </dd>
        </div>
      </dl>

      <nav className="tabs" aria-label="Quick views">
        {quick.map(([label, q]) => (
          <Link key={label} href={`${a}/inbox?${q}`} aria-current={query === q ? 'page' : undefined} className={query === q ? 'tab tab-active' : 'tab'}>
            {label}
          </Link>
        ))}
        {views.map((v) => {
          const q = new URLSearchParams(v.filters).toString();
          return (
            <Link key={v.id} href={`${a}/inbox?${q}`} aria-current={query === q ? 'page' : undefined} className={query === q ? 'tab tab-active' : 'tab'}>
              {v.name}
            </Link>
          );
        })}
      </nav>

      <section className="panel">
        <form className="filters" method="get">
          <div className="field">
            <label htmlFor="f-status">Status</label>
            <select id="f-status" name="status" defaultValue={filters.status}>
              <option value="open">Open</option>
              <option value="new">New</option>
              <option value="in_progress">In progress</option>
              <option value="waiting">Waiting on family</option>
              <option value="resolved">Resolved</option>
              <option value="cancelled">Cancelled</option>
              <option value="all">All</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-kind">Type</label>
            <select id="f-kind" name="kind" defaultValue={filters.kind}>
              <option value="">All</option>
              <option value="attendance">Attendance</option>
              <option value="question">Questions</option>
              <option value="request">Requests</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-assignee">Owner</label>
            <select id="f-assignee" name="assignee" defaultValue={filters.assignee}>
              <option value="">Anyone</option>
              <option value="me">Me</option>
              <option value="none">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-grade">Grade</label>
            <select id="f-grade" name="gradeId" defaultValue={filters.gradeId}>
              <option value="">All</option>
              {visibleGrades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-priority">Priority</label>
            <select id="f-priority" name="priority" defaultValue={filters.priority}>
              <option value="">All</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-q">Search</label>
            <input id="f-q" name="q" defaultValue={filters.q} placeholder="R-1042, subject or student" />
          </div>
          <label className="check">
            <input type="checkbox" name="overdue" value="1" defaultChecked={filters.overdue === '1'} /> Overdue only
          </label>
          <button className="btn btn-quiet btn-sm" type="submit">
            Filter
          </button>
        </form>
        <InboxTable
          rows={rows.map((r) => ({
            id: r.id,
            number: r.number,
            kind: r.kind,
            subject: r.subject,
            status: r.status,
            priority: r.priority,
            student: r.student,
            grade: r.grade,
            assignee: r.assignee,
            requester: r.requester,
            due: r.dueAt ? fmt.format(r.dueAt) : null,
            overdue: r.overdue,
            automated: r.automated,
            href: `${a}/inbox/${r.id}`,
          }))}
          action={bulkAction.bind(null, key)}
          canManage={canManage && !ctx.support}
          staff={staff}
        />
      </section>

      <section className="panel" aria-labelledby="views-title">
        <div className="panel-head">
          <h2 id="views-title">Saved views</h2>
        </div>
        <div className="panel-body">
          <OpsForm action={saveViewAction.bind(null, key, query)} submit="Save current filters" className="form" resetOnOk>
            <div className="field">
              <label htmlFor="view-name">Name</label>
              <input id="view-name" name="name" maxLength={60} required placeholder="e.g. Grade 3 absences" />
            </div>
          </OpsForm>
          {views.length > 0 && (
            <ul className="plain-list">
              {views.map((v) => (
                <li key={v.id} className="inline-action">
                  {v.name} <ConfirmButton run={deleteViewAction.bind(null, key, v.id)} label="Delete" confirmLabel="Delete view" danger />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
