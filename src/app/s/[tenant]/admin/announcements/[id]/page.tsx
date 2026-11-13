import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { AuthorizationError, hasAnywhere } from '@/server/rbac/authorize';
import { ValidationError } from '@/server/services/modules';
import { getAnnouncementForStaff } from '@/server/services/content';
import { getContentSettings, listAudiences } from '@/server/services/calendar';
import { availableTransitions } from '@/server/services/workflow';
import { StatusBadge } from '../../calendar/shared';
import { AnnouncementForm } from '../form';
import { ModuleGate, toLocalInput } from '../shared';
import { AudiencePicker } from '../../_components/audience-picker';
import { DeleteWithConfirm, Workflow } from '../../_components/workflow';
import { deleteAnnouncementAction, transitionAnnouncementAction } from '../actions';

export const metadata = { title: 'Edit announcement' };

type Props = { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ saved?: string }> };

export default async function EditAnnouncementPage({ params, searchParams }: Props) {
  const { tenant: key, id } = await params;
  const { tenant, ctx } = await requireStaff(key);
  const base = await tenantBase(key);
  let row;
  try {
    row = await getAnnouncementForStaff(ctx, id);
  } catch (err) {
    if (err instanceof ValidationError || err instanceof AuthorizationError) notFound();
    throw err;
  }
  const sp = await searchParams;
  const [auds, settings] = await Promise.all([listAudiences(tenant.id), getContentSettings(tenant.id)]);
  const actions = availableTransitions((perm) => hasAnywhere(ctx, perm), 'announcements', row.status, settings);
  const canEdit = hasAnywhere(ctx, 'announcements.edit') && row.status !== 'archived';
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="announcements" name="Announcements">
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/announcements`}>← Announcements</Link>
          </p>
          <h1>{row.title}</h1>
          <p>
            <StatusBadge status={row.status} />
            {row.status === 'published' && (
              <>
                {' '}
                <Link href={`${base}/updates/${row.id}`}>View on portal</Link>
              </>
            )}
          </p>
        </div>
        <Workflow actions={actions} run={transitionAnnouncementAction.bind(null, key, row.id)} />
      </div>
      {sp.saved && <div className="notice notice-ok">Saved.</div>}
      <section className="panel">
        <div className="panel-body">
          {canEdit ? (
            <AnnouncementForm
              tenantKey={key}
              id={row.id}
              status={row.status}
              canPublish={hasAnywhere(ctx, 'announcements.publish')}
              requireApproval={settings.requireApproval}
              timezone={tenant.timezone}
              audiencePicker={<AudiencePicker audiences={auds} selected={row.audienceIds} visibility={row.visibility} />}
              defaults={{
                title: row.title,
                summary: row.summary ?? '',
                body: row.body,
                isUrgent: row.isUrgent,
                isPinned: row.isPinned,
                publishAt: toLocalInput(row.publishAt, tenant.timezone),
                expiresAt: toLocalInput(row.expiresAt, tenant.timezone),
              }}
            />
          ) : (
            <p className="muted">{row.status === 'archived' ? 'Archived announcements cannot be edited. Restore it first.' : 'You can view this announcement but not edit it.'}</p>
          )}
        </div>
      </section>
      {hasAnywhere(ctx, 'announcements.delete') && (
        <section className="panel">
          <div className="panel-body">
            <DeleteWithConfirm title={row.title} noun="announcement" run={deleteAnnouncementAction.bind(null, key, row.id)} />
          </div>
        </section>
      )}
    </ModuleGate>
  );
}
