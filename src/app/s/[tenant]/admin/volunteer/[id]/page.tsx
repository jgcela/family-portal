import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { AuthorizationError, hasAnywhere } from '@/server/rbac/authorize';
import { ValidationError } from '@/server/errors';
import { getVolunteerForStaff, listVolunteerForStaff } from '@/server/services/volunteer';
import { getContentSettings, listAudiences } from '@/server/services/calendar';
import { availableTransitions } from '@/server/services/workflow';
import { StatusBadge } from '../../calendar/shared';
import { ModuleGate } from '../../announcements/shared';
import { AudiencePicker } from '../../_components/audience-picker';
import { DeleteWithConfirm, Workflow } from '../../_components/workflow';
import { VolunteerForm } from '../form';
import { deleteVolunteerAction, transitionVolunteerAction } from '../actions';

export const metadata = { title: 'Edit opportunity' };

type Props = { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ saved?: string }> };

export default async function EditVolunteer({ params, searchParams }: Props) {
  const { tenant: key, id } = await params;
  const { tenant, ctx } = await requireStaff(key);
  const base = await tenantBase(key);
  let row;
  try {
    row = await getVolunteerForStaff(ctx, id);
  } catch (err) {
    if (err instanceof ValidationError || err instanceof AuthorizationError) notFound();
    throw err;
  }
  const sp = await searchParams;
  const [auds, settings, rows] = await Promise.all([listAudiences(tenant.id), getContentSettings(tenant.id), listVolunteerForStaff(ctx)]);
  const categories = [...new Set(rows.map((r) => r.category).filter((c): c is string => !!c))].sort();
  const actions = ctx.support ? [] : availableTransitions((perm) => hasAnywhere(ctx, perm), 'volunteer', row.status, settings);
  const canEdit = !ctx.support && hasAnywhere(ctx, 'volunteer.edit') && row.status !== 'archived';
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="volunteer" name="Volunteer">
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/volunteer`}>← Volunteer</Link>
          </p>
          <h1>{row.title}</h1>
          <p>
            <StatusBadge status={row.status} />
            {row.status === 'published' && (
              <>
                {' '}
                <Link href={`${base}/volunteer#v-${row.id}`}>View on portal</Link>
              </>
            )}
          </p>
        </div>
        <Workflow actions={actions} run={transitionVolunteerAction.bind(null, key, row.id)} />
      </div>
      {sp.saved && <div className="notice notice-ok">Saved.</div>}
      <section className="panel">
        <div className="panel-body">
          {canEdit ? (
            <VolunteerForm
              tenantKey={key}
              id={row.id}
              status={row.status}
              categories={categories}
              canPublish={hasAnywhere(ctx, 'volunteer.publish')}
              requireApproval={settings.requireApproval}
              audiencePicker={<AudiencePicker audiences={auds} selected={row.audienceIds} visibility={row.visibility} />}
              defaults={{
                title: row.title,
                category: row.category ?? '',
                organizer: row.organizer ?? '',
                location: row.location ?? '',
                schedule: row.schedule ?? '',
                commitment: row.commitment ?? '',
                summary: row.summary ?? '',
                body: row.body,
                actions: row.actions,
                sortOrder: row.sortOrder,
              }}
            />
          ) : (
            <p className="muted">{row.status === 'archived' ? 'Archived opportunities cannot be edited. Restore it first.' : 'You can view this opportunity but not edit it.'}</p>
          )}
        </div>
      </section>
      {!ctx.support && hasAnywhere(ctx, 'volunteer.delete') && (
        <section className="panel">
          <div className="panel-body">
            <DeleteWithConfirm title={row.title} noun="opportunity" run={deleteVolunteerAction.bind(null, key, row.id)} />
          </div>
        </section>
      )}
    </ModuleGate>
  );
}
