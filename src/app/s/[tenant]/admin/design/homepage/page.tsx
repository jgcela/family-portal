import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { getHomepageEditorState } from '@/server/services/homepage';
import { getModuleState } from '@/server/services/modules';
import { DEFAULT_HOMEPAGE } from '@/server/tenancy/homepage-defaults';
import { formatInstant } from '../../announcements/shared';
import { discardHomepageAction, restoreHomepageAction, saveHomepageAction } from '../actions';
import { ActionButton } from '../action-button';
import { HomepageBuilder } from './builder';
import { startPreviewAction } from '../../../preview-actions';

export const metadata = { title: 'Homepage' };

type Props = { params: Promise<{ tenant: string }> };

export default async function HomepagePage({ params }: Props) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'homepage.edit')) notFound();
  const base = await tenantBase(key);
  const [state, modules] = await Promise.all([getHomepageEditorState(ctx), getModuleState(tenant.id)]);
  const initial = state.draft?.blocks ?? state.published?.blocks ?? DEFAULT_HOMEPAGE;
  const tz = tenant.timezone;

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="muted">
            <Link href={`${base}/admin/design`}>Design</Link>
          </p>
          <h1>Homepage</h1>
          <p>Choose which blocks families see on the portal homepage and in what order. Changes stay in a draft until you publish.</p>
        </div>
        <div className="form-actions">
          {state.draft && (
            <form action={startPreviewAction.bind(null, key)}>
              <button className="btn btn-quiet btn-sm" type="submit">
                Preview draft on the portal
              </button>
            </form>
          )}
          {state.draft && <ActionButton run={discardHomepageAction.bind(null, key)} label="Discard draft" className="btn btn-danger btn-sm" />}
        </div>
      </div>
      {state.draft && (
        <p className="notice">
          You are editing a draft saved {formatInstant(state.draft.createdAt, tz)}. Families still see the published homepage
          {state.published?.publishedAt ? ` from ${formatInstant(state.published.publishedAt, tz)}` : ''}.
        </p>
      )}
      <HomepageBuilder
        initial={initial}
        activeModules={modules.active.map((m) => m.id)}
        moduleNames={Object.fromEntries(modules.catalog.map((m) => [m.id, m.name]))}
        canPublish={hasAnywhere(ctx, 'homepage.publish')}
        hasDraft={!!state.draft}
        save={saveHomepageAction.bind(null, key)}
      />
      {state.history.length > 0 && (
        <section className="panel" aria-labelledby="home-history" style={{ marginTop: 'var(--space-6)' }}>
          <div className="panel-head">
            <h2 id="home-history">Earlier published homepages</h2>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Published</th>
                  <th scope="col">Blocks</th>
                  <th scope="col">
                    <span className="visually-hidden">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.history.map((h) => (
                  <tr key={h.id}>
                    <td className="nowrap">{formatInstant(h.publishedAt, tz)}</td>
                    <td>{h.blockCount}</td>
                    <td>
                      <ActionButton run={restoreHomepageAction.bind(null, key, h.id)} label="Use as draft" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
