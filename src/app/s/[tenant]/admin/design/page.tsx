import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { startPreviewAction } from '../../preview-actions';

export const metadata = { title: 'Design' };

type Props = { params: Promise<{ tenant: string }> };

export default async function DesignPage({ params }: Props) {
  const key = (await params).tenant;
  const { ctx } = await requireStaff(key);
  const canTheme = hasAnywhere(ctx, 'branding.manage');
  const canHome = hasAnywhere(ctx, 'homepage.edit');
  if (!canTheme && !canHome) notFound();
  const a = `${await tenantBase(key)}/admin/design`;
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Design</h1>
          <p>How your family portal looks. Every change is saved as a draft first, so you can preview it before families see it.</p>
        </div>
        <form action={startPreviewAction.bind(null, key)}>
          <button className="btn btn-quiet btn-sm" type="submit">
            Preview drafts on the portal
          </button>
        </form>
      </div>
      <div className="stat-grid">
        {canTheme && (
          <Link href={`${a}/theme`} className="stat design-card">
            <strong>Theme</strong>
            <span className="muted">Colours, fonts, corners, header style and logos.</span>
          </Link>
        )}
        {canHome && (
          <Link href={`${a}/homepage`} className="stat design-card">
            <strong>Homepage</strong>
            <span className="muted">Which blocks families see first, and in what order.</span>
          </Link>
        )}
      </div>
    </>
  );
}
