import { notFound } from 'next/navigation';
import { hasAnywhere } from '@/server/rbac/authorize';
import { getModuleState } from '@/server/services/modules';
import { requireStaff } from '@/server/request';

export const metadata = { title: 'Module Manager' };

type Props = { params: Promise<{ tenant: string }> };

export default async function ModulesPage({ params }: Props) {
  const { tenant, ctx } = await requireStaff((await params).tenant);
  if (!hasAnywhere(ctx, 'modules.view')) notFound();
  const state = await getModuleState(tenant.id);
  const core = state.catalog.filter((m) => m.stage === 'core');
  const future = state.catalog.filter((m) => m.stage === 'future');

  const status = (m: (typeof state.catalog)[number]) => {
    if (m.enabled && m.implemented) return <span className="badge badge-on">On</span>;
    if (!m.implemented) return <span className="badge badge-future">Coming later</span>;
    if (!m.entitled) return <span className="badge">Not in your plan</span>;
    return <span className="badge badge-off">Off</span>;
  };

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Module Manager</h1>
          <p>Modules your portal can use. Turning a module off hides it from families but never deletes its content.</p>
        </div>
      </div>
      {[
        { title: 'Portal modules', list: core },
        { title: 'Planned modules', list: future },
      ].map((g) => (
        <section className="panel" key={g.title} aria-labelledby={g.title}>
          <div className="panel-head">
            <h2 id={g.title}>{g.title}</h2>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Module</th>
                  <th scope="col">Description</th>
                  <th scope="col">Needs</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {g.list.map((m) => (
                  <tr key={m.id}>
                    <th scope="row">{m.name}</th>
                    <td className="muted">{m.description}</td>
                    <td className="muted">{m.dependencies.join(', ') || '—'}</td>
                    <td>{status(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
