import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { COMMUNITY_KINDS, MAX_DETAILS, listCommunityForStaff, type CommunityKind } from '@/server/services/community';
import { ModuleGate } from '../../announcements/shared';
import { CommunityForm } from '../form';
import { suggestions } from '../suggestions';

export const metadata = { title: 'New community item' };

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ kind?: string }> };

export default async function NewCommunityItem({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'community.create') || ctx.support) notFound();
  const kind: CommunityKind = (await searchParams).kind === 'favorites' ? 'favorites' : 'wishlist';
  const base = await tenantBase(key);
  const rows = await listCommunityForStaff(ctx, kind);
  const s = suggestions(rows);
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="community" name="Community">
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/community?kind=${kind}`}>← {COMMUNITY_KINDS[kind].label}</Link>
          </p>
          <h1>New {COMMUNITY_KINDS[kind].noun}</h1>
        </div>
      </div>
      <section className="panel">
        <div className="panel-body">
          <CommunityForm
            tenantKey={key}
            id={null}
            kind={kind}
            groups={s.groups}
            labels={s.labels}
            maxDetails={MAX_DETAILS}
            defaults={{
              groupName: '',
              name: '',
              role: '',
              url: '',
              details: [],
              visibility: COMMUNITY_KINDS[kind].defaultVisibility,
              isActive: true,
              sortOrder: (rows.length + 1) * 10,
            }}
          />
        </div>
      </section>
    </ModuleGate>
  );
}
