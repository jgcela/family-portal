import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { getThemeEditorState } from '@/server/services/theme';
import { DEFAULT_THEME } from '@/server/theme/tokens';
import { formatInstant } from '../../announcements/shared';
import { discardThemeAction, restoreThemeAction, saveThemeAction } from '../actions';
import { ActionButton } from '../action-button';
import { ThemeEditor } from './editor';
import { startPreviewAction } from '../../../preview-actions';

export const metadata = { title: 'Theme' };

type Props = { params: Promise<{ tenant: string }> };

export default async function ThemePage({ params }: Props) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'branding.manage')) notFound();
  const base = await tenantBase(key);
  const state = await getThemeEditorState(ctx);
  const initial = state.draft?.tokens ?? state.published?.tokens ?? DEFAULT_THEME;
  const tz = tenant.timezone;

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="muted">
            <Link href={`${base}/admin/design`}>Design</Link>
          </p>
          <h1>Theme</h1>
          <p>
            Colours, fonts and logos for your family portal. Changes stay in a draft until you publish. Text colours are
            checked for readability (WCAG AA) and the portal will not publish a theme that fails.
          </p>
        </div>
        <div className="form-actions">
          {state.draft && (
            <form action={startPreviewAction.bind(null, key)}>
              <button className="btn btn-quiet btn-sm" type="submit">
                Preview draft on the portal
              </button>
            </form>
          )}
          {state.draft && <ActionButton run={discardThemeAction.bind(null, key)} label="Discard draft" className="btn btn-danger btn-sm" />}
        </div>
      </div>
      {state.draft && (
        <p className="notice">
          You are editing a draft saved {formatInstant(state.draft.createdAt, tz)}. Families still see the published theme
          {state.published?.publishedAt ? ` from ${formatInstant(state.published.publishedAt, tz)}` : ''}.
        </p>
      )}
      <ThemeEditor
        initial={initial}
        hasDraft={!!state.draft}
        canPublish={hasAnywhere(ctx, 'branding.publish')}
        save={saveThemeAction.bind(null, key)}
      />
      {state.history.length > 0 && (
        <section className="panel" aria-labelledby="theme-history" style={{ marginTop: 'var(--space-6)' }}>
          <div className="panel-head">
            <h2 id="theme-history">Earlier published themes</h2>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Published</th>
                  <th scope="col">Colours</th>
                  <th scope="col">
                    <span className="visually-hidden">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.history.map((h) => (
                  <tr key={h.id}>
                    <td className="nowrap">{formatInstant(h.publishedAt, tz)}</td>
                    <td>
                      {Object.values(h.tokens.colors).map((c, i) => (
                        <span key={i} className="swatch swatch-lg" style={{ background: c }} title={c} />
                      ))}
                    </td>
                    <td>
                      <ActionButton run={restoreThemeAction.bind(null, key, h.id)} label="Use as draft" />
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
