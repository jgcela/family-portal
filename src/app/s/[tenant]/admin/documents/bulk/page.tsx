import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { hasAnywhere } from '@/server/rbac/authorize';
import { getContentSettings, listAudiences } from '@/server/services/calendar';
import { listDocumentCategories } from '@/server/services/documents';
import { DIRECT_UPLOAD_ABOVE_BYTES, MAX_DIRECT_UPLOAD_BYTES } from '@/server/services/uploads';
import { ModuleGate } from '../../announcements/shared';
import { AudiencePicker } from '../../_components/audience-picker';
import { bulkCreateDocumentAction, startUploadAction } from '../actions';
import { AUDIENCE_NOTE } from '../note';
import { BulkUploadForm } from './bulk-form';

export const metadata = { title: 'Upload several documents' };

export default async function BulkUpload({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (ctx.support || !hasAnywhere(ctx, 'documents.create') || !hasAnywhere(ctx, 'documents.upload')) notFound();
  const base = await tenantBase(key);
  const [auds, settings, categories] = await Promise.all([listAudiences(tenant.id), getContentSettings(tenant.id), listDocumentCategories(tenant.id)]);
  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="documents" name="Documents">
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/documents`}>← Documents</Link>
          </p>
          <h1>Upload several documents</h1>
          <p>Each file becomes its own document with its own permanent link. The settings below apply to every file in this batch.</p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-body">
          <BulkUploadForm
            create={bulkCreateDocumentAction.bind(null, key)}
            startUpload={startUploadAction.bind(null, key)}
            inlineMaxBytes={DIRECT_UPLOAD_ABOVE_BYTES}
            maxBytes={MAX_DIRECT_UPLOAD_BYTES}
            categories={categories}
            canPublish={hasAnywhere(ctx, 'documents.publish') && !settings.requireApproval}
            docBase={`${base}/admin/documents`}
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
