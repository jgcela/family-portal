import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { AuthorizationError, hasAnywhere } from '@/server/rbac/authorize';
import { ValidationError } from '@/server/services/modules';
import { getPageForStaff } from '@/server/services/content';
import { getContentSettings, listAudiences } from '@/server/services/calendar';
import { availableTransitions, type Transition } from '@/server/services/workflow';
import { StatusBadge } from '../../calendar/shared';
import { PageForm } from '../form';
import { VersionRow } from '../versions';
import { formatInstant, ModuleGate } from '../../announcements/shared';
import { AudiencePicker } from '../../_components/audience-picker';
import { DeleteWithConfirm, Workflow } from '../../_components/workflow';
import { deletePageAction, restoreVersionAction, transitionPageAction } from '../actions';

export const metadata = { title: 'Edit page' };

type Props = { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ saved?: string }> };

export default async function EditPage({ params, searchParams }: Props) {
  const { tenant: key, id } = await params;
  const { tenant, ctx } = await requireStaff(key);
  const base = await tenantBase(key);
  let data;
  try {
    data = await getPageForStaff(ctx, id);
  } catch (err) {
    if (err instanceof ValidationError || err instanceof AuthorizationError) notFound();
    throw err;
  }
  const { page, versions } = data;
  const sp = await searchParams;
  const [auds, settings] = await Promise.all([listAudiences(tenant.id), getContentSettings(tenant.id)]);
  const can = (perm: string) => hasAnywhere(ctx, perm);
  const actions: Transition[] = availableTransitions(can, 'pages', page.status, settings).filter((a) => a !== 'unpublish');
  if (page.publishedVersionId && can('pages.publish')) actions.push('unpublish');
  const canEdit = can('pages.edit') && page.status !== 'archived';
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="pages" name="School Pages">
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/pages`}>← School pages</Link>
          </p>
          <h1>{page.title}</h1>
          <p>
            <StatusBadge status={page.status} />
            {page.publishedVersionId && (
              <>
                {' '}
                <Link href={`${base}/p/${page.slug}`}>View live page</Link>
              </>
            )}
          </p>
        </div>
        <Workflow actions={actions} run={transitionPageAction.bind(null, key, page.id)} />
      </div>
      {sp.saved && <div className="notice notice-ok">Saved.</div>}
      <section className="panel">
        <div className="panel-body">
          {canEdit ? (
            <PageForm
              tenantKey={key}
              id={page.id}
              status={page.status}
              isLive={!!page.publishedVersionId}
              urlPrefix={base}
              canPublish={can('pages.publish')}
              requireApproval={settings.requireApproval}
              audiencePicker={<AudiencePicker audiences={auds} selected={page.audienceIds} />}
              defaults={{ title: page.title, slug: page.slug, body: page.body, showToc: page.showToc, sortOrder: page.sortOrder }}
            />
          ) : (
            <p className="muted">{page.status === 'archived' ? 'Archived pages cannot be edited. Restore it first.' : 'You can view this page but not edit it.'}</p>
          )}
        </div>
      </section>
      {versions.length > 0 && (
        <section className="panel" aria-labelledby="versions-title">
          <div className="panel-head">
            <h2 id="versions-title">Published versions</h2>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Version</th>
                  <th scope="col">Published</th>
                  <th scope="col">
                    <span className="visually-hidden">Live</span>
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <VersionRow
                    key={v.id}
                    version={v.version}
                    when={formatInstant(v.createdAt, tenant.timezone)}
                    live={v.id === page.publishedVersionId}
                    canRestore={canEdit}
                    run={restoreVersionAction.bind(null, key, page.id, v.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {can('pages.delete') && (
        <section className="panel">
          <div className="panel-body">
            <DeleteWithConfirm title={page.title} noun="page" run={deletePageAction.bind(null, key, page.id)} />
          </div>
        </section>
      )}
    </ModuleGate>
  );
}
