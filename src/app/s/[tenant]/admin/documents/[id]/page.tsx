import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { AuthorizationError, can as canOn, hasAnywhere } from '@/server/rbac/authorize';
import { ValidationError } from '@/server/services/modules';
import { getDocumentForStaff, listDocumentCategories, MAX_UPLOAD_BYTES } from '@/server/services/documents';
import { listAudiences } from '@/server/services/calendar';
import { availableTransitions } from '@/server/services/workflow';
import { StatusBadge } from '../../calendar/shared';
import { formatInstant, ModuleGate } from '../../announcements/shared';
import { AudiencePicker } from '../../_components/audience-picker';
import { DeleteWithConfirm, Workflow } from '../../_components/workflow';
import { ActionButton } from '../../design/action-button';
import { CopyLink, DocumentForm, UploadVersionForm } from '../form';
import {
  deleteDocumentAction,
  setCurrentVersionAction,
  transitionDocumentAction,
  updateDocumentAction,
  uploadVersionAction,
} from '../actions';
import { fileLabel, formatBytes } from '../shared';
import { AUDIENCE_NOTE } from '../note';

export const metadata = { title: 'Document' };

type Props = { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ saved?: string }> };

export default async function DocumentPage({ params, searchParams }: Props) {
  const { tenant: key, id } = await params;
  const { tenant, ctx } = await requireStaff(key);
  const base = await tenantBase(key);
  let data;
  try {
    data = await getDocumentForStaff(ctx, id);
  } catch (err) {
    if (err instanceof ValidationError || err instanceof AuthorizationError) notFound();
    throw err;
  }
  const { doc, versions, res, settings } = data;
  const sp = await searchParams;
  const [auds, categories] = await Promise.all([listAudiences(tenant.id), listDocumentCategories(tenant.id)]);
  const can = (perm: string) => canOn(ctx, perm, res);
  const live = doc.status === 'published';
  // On a live document, every change is visible immediately.
  const canEdit = can('documents.edit') && doc.status !== 'archived' && (!live || can('documents.publish'));
  const canUpload = canEdit && can('documents.upload');
  const link = `${base}/d/${doc.slug}`;
  const maxMb = MAX_UPLOAD_BYTES / 1048576;

  return (
    <ModuleGate tenantId={tenant.id} base={base} moduleId="documents" name="Documents">
      <div className="admin-head">
        <div>
          <p>
            <Link href={`${base}/admin/documents`}>← Documents</Link>
          </p>
          <h1>{doc.title}</h1>
          <p>
            <StatusBadge status={doc.status} /> <CopyLink url={link} />
          </p>
        </div>
        <Workflow actions={availableTransitions(can, 'documents', doc.status, settings)} run={transitionDocumentAction.bind(null, key, doc.id)} />
      </div>
      {sp.saved && <div className="notice notice-ok">Uploaded.</div>}
      {!live && <div className="notice">Families cannot open this link until the document is published.</div>}
      {live && doc.visibility !== 'public' && <div className="notice">{AUDIENCE_NOTE}</div>}

      <section className="panel" aria-labelledby="file-title">
        <div className="panel-head">
          <h2 id="file-title">File</h2>
          <a className="btn btn-quiet btn-sm" href={link} target="_blank" rel="noopener">
            Open
          </a>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Version</th>
                <th scope="col">File</th>
                <th scope="col">Uploaded</th>
                <th scope="col">
                  <span className="visually-hidden">State</span>
                </th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td>v{v.version}</td>
                  <td>
                    {v.fileName}
                    <div className="muted">
                      {fileLabel(v.contentType)} · {formatBytes(v.sizeBytes)}
                    </div>
                  </td>
                  <td className="nowrap">{formatInstant(v.createdAt, tenant.timezone)}</td>
                  <td>{v.id === doc.currentVersionId && <span className="status status-published">Current</span>}</td>
                  <td>
                    <div className="inline-action">
                      <a className="btn btn-quiet btn-sm" href={`${link}?v=${v.version}&download=1`}>
                        Download
                      </a>
                      {canEdit && v.id !== doc.currentVersionId && (
                        <ActionButton run={setCurrentVersionAction.bind(null, key, doc.id, v.id)} label="Make current" ariaLabel={`Make version ${v.version} current`} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canUpload && (
          <div className="panel-body">
            <UploadVersionForm run={uploadVersionAction.bind(null, key, doc.id)} maxMb={maxMb} />
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="details-title">
        <div className="panel-head">
          <h2 id="details-title">Details</h2>
        </div>
        <div className="panel-body">
          {canEdit ? (
            <DocumentForm
              run={updateDocumentAction.bind(null, key, doc.id)}
              isNew={false}
              defaults={{ title: doc.title, slug: doc.slug, description: doc.description ?? '', category: doc.category ?? '' }}
              categories={categories}
              linkPrefix={base}
              canPublish={false}
              requireApproval={settings.requireApproval}
              maxMb={maxMb}
              audiencePicker={
                <>
                  <AudiencePicker audiences={auds} selected={doc.audienceIds} visibility={doc.visibility} />
                  <p className="hint">{AUDIENCE_NOTE}</p>
                </>
              }
            />
          ) : (
            <p className="muted">
              {doc.status === 'archived'
                ? 'Archived documents cannot be edited. Restore it first.'
                : live
                  ? 'This document is live. Changing it needs permission to publish documents.'
                  : 'You can view this document but not edit it.'}
            </p>
          )}
        </div>
      </section>
      {hasAnywhere(ctx, 'documents.delete') && can('documents.delete') && (
        <section className="panel">
          <div className="panel-body">
            <p className="muted">Deleting removes every version and its stored file. Links to it will stop working.</p>
            <DeleteWithConfirm title={doc.title} noun="document" run={deleteDocumentAction.bind(null, key, doc.id)} />
          </div>
        </section>
      )}
    </ModuleGate>
  );
}
