import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { AuthorizationError, hasAnywhere } from '@/server/rbac/authorize';
import { ValidationError } from '@/server/errors';
import { COMMUNITY_KINDS, MAX_DETAILS, getCommunityItemForStaff, listCommunityForStaff, type CommunityKind } from '@/server/services/community';
import { ModuleGate } from '../../announcements/shared';
import { DeleteWithConfirm } from '../../_components/workflow';
import { CommunityForm } from '../form';
import { suggestions } from '../suggestions';
import { deleteCommunityAction } from '../actions';

export const metadata = { title: 'Edit community item' };

export default async function EditCommunityItem({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant: key, id } = await params;
  const { tenant, ctx } = await requireStaff(key);
  const base = await tenantBase(key);
  let row;
  try {
    row = await getCommunityItemForStaff(ctx, id);
  } catch (err) {
    if (err instanceof ValidationError || err instanceof AuthorizationError) notFound();
    throw err;
  }
  const kind = row.kind as CommunityKind;
  const s = suggestions(await listCommunityForStaff(ctx, kind));
  const canEdit = !ctx.support && hasAnywhere(ctx, 'community.edit');
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="community" name="Community">
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/community?kind=${kind}`}>← {COMMUNITY_KINDS[kind].label}</Link>
          </p>
          <h1>{row.name}</h1>
          {row.isActive && (
            <p>
              <Link href={`${base}/community#${kind === 'wishlist' ? 'w' : 'f'}-${row.id}`}>View on portal</Link>
            </p>
          )}
        </div>
      </div>
      <section className="panel">
        <div className="panel-body">
          {canEdit ? (
            <CommunityForm
              tenantKey={key}
              id={row.id}
              kind={kind}
              groups={s.groups}
              labels={s.labels}
              maxDetails={MAX_DETAILS}
              defaults={{
                groupName: row.groupName ?? '',
                name: row.name,
                role: row.role ?? '',
                url: row.url ?? '',
                details: row.details,
                visibility: row.visibility,
                isActive: row.isActive,
                sortOrder: row.sortOrder,
              }}
            />
          ) : (
            <p className="muted">You can view this item but not edit it.</p>
          )}
        </div>
      </section>
      {!ctx.support && hasAnywhere(ctx, 'community.delete') && (
        <section className="panel">
          <div className="panel-body">
            <DeleteWithConfirm title={row.name} noun={COMMUNITY_KINDS[kind].noun} run={deleteCommunityAction.bind(null, key, row.id, kind)} />
          </div>
        </section>
      )}
    </ModuleGate>
  );
}
