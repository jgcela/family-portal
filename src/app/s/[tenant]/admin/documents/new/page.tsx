import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { getContentSettings, listAudiences } from '@/server/services/calendar';
import { listDocumentCategories } from '@/server/services/documents';
import { ModuleGate } from '../../announcements/shared';
import { AudiencePicker } from '../../_components/audience-picker';
import { DocumentForm } from '../form';
import { createDocumentAction, startUploadAction } from '../actions';
import { DIRECT_UPLOAD_ABOVE_BYTES, MAX_DIRECT_UPLOAD_BYTES } from '@/server/services/uploads';
import { AUDIENCE_NOTE } from '../note';

export const metadata = { title: 'Upload document' };

export default async function NewDocument({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!hasAnywhere(ctx, 'documents.create') || !hasAnywhere(ctx, 'documents.upload')) notFound();
  const base = await tenantBase(key);
  const [auds, settings, categories] = await Promise.all([listAudiences(tenant.id), getContentSettings(tenant.id), listDocumentCategories(tenant.id)]);
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="documents" name="Documents">
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/documents`}>← Documents</Link>
          </p>
          <h1>Upload document</h1>
        </div>
      </div>
      <section className="panel">
        <div className="panel-body">
          <DocumentForm
            run={createDocumentAction.bind(null, key)}
            isNew
            defaults={{ title: '', slug: '', description: '', category: '' }}
            categories={categories}
            linkPrefix={base}
            canPublish={hasAnywhere(ctx, 'documents.publish')}
            requireApproval={settings.requireApproval}
            maxMb={MAX_DIRECT_UPLOAD_BYTES / 1048576}
            inlineMaxBytes={DIRECT_UPLOAD_ABOVE_BYTES}
            startUpload={startUploadAction.bind(null, key)}
            audiencePicker={
              <>
                <AudiencePicker audiences={auds} selected={[]} visibility="public" />
                <p className="hint">{AUDIENCE_NOTE}</p>
              </>
            }
          />
        </div>
      </section>
    </ModuleGate>
  );
}
