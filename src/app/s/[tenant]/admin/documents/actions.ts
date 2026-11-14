'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import {
  createDocument,
  deleteDocument,
  MAX_UPLOAD_BYTES,
  setCurrentDocumentVersion,
  transitionDocument,
  updateDocument,
  uploadDocumentVersion,
  type UploadedFile,
} from '@/server/services/documents';
import { createUploadTicket } from '@/server/services/uploads';
import { StorageNotConfiguredError } from '@/server/storage/storage';
import type { Transition } from '@/server/services/workflow';
import { errorMessage, ids, str } from '../_components/action-helpers';

type Result = { error?: string; ok?: string } | undefined;

async function fileFrom(fd: FormData): Promise<UploadedFile | string> {
  // Big files were sent straight to storage by the browser; the form carries a token.
  const token = str(fd, 'uploadToken');
  if (token) return { name: str(fd, 'uploadName') || 'file', token };
  const f = fd.get('file');
  if (!(f instanceof File) || f.size === 0) return 'Choose a file to upload.';
  if (f.size > MAX_UPLOAD_BYTES) return `The file is ${(f.size / 1048576).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1048576} MB.`;
  return { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) };
}

function message(err: unknown) {
  if (err instanceof StorageNotConfiguredError) return 'File storage is not set up yet. Ask the platform administrator to add the R2 settings.';
  return errorMessage(err);
}

/** Step 1 of a direct upload: a signed URL the browser sends the file to. */
export async function startUploadAction(tenantKey: string, fileName: string, sizeBytes: number): Promise<{ token: string; putUrl: string } | { error: string }> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    return await createUploadTicket(ctx, { fileName, sizeBytes });
  } catch (err) {
    return { error: message(err) };
  }
}

const meta = (fd: FormData) => ({
  title: str(fd, 'title'),
  slug: str(fd, 'slug'),
  description: str(fd, 'description'),
  category: str(fd, 'category'),
  audienceIds: ids(fd, 'audienceIds'),
  visibility: str(fd, 'visibility') || 'public',
});

export async function createDocumentAction(tenantKey: string, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  const base = await tenantBase(tenantKey);
  const file = await fileFrom(fd);
  if (typeof file === 'string') return { error: file };
  let id: string;
  try {
    id = (await createDocument(ctx, meta(fd), file)).id;
    if (str(fd, 'then') === 'publish') await transitionDocument(ctx, id, 'publish');
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath(`${base}/admin/documents`);
  redirect(`${base}/admin/documents/${id}?saved=1`);
}

export async function updateDocumentAction(tenantKey: string, id: string, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await updateDocument(ctx, id, meta(fd));
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath(`${await tenantBase(tenantKey)}/admin/documents`, 'layout');
  return { ok: 'Saved.' };
}

export async function uploadVersionAction(tenantKey: string, id: string, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  const file = await fileFrom(fd);
  if (typeof file === 'string') return { error: file };
  try {
    const v = await uploadDocumentVersion(ctx, id, file);
    revalidatePath(`${await tenantBase(tenantKey)}/admin/documents`, 'layout');
    return { ok: `Version ${v.version} uploaded. The link now opens this file.` };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function transitionDocumentAction(tenantKey: string, id: string, action: Transition): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await transitionDocument(ctx, id, action);
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath(await tenantBase(tenantKey), 'layout');
  return { ok: 'Done.' };
}

export async function setCurrentVersionAction(tenantKey: string, id: string, versionId: string): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    const v = await setCurrentDocumentVersion(ctx, id, versionId);
    revalidatePath(`${await tenantBase(tenantKey)}/admin/documents`, 'layout');
    return { ok: `The link now opens version ${v.version}.` };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function deleteDocumentAction(tenantKey: string, id: string, _prev: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  if (str(fd, 'confirm').toLowerCase() !== 'delete') return { error: 'Type "delete" to confirm.' };
  try {
    await deleteDocument(ctx, id);
  } catch (err) {
    return { error: message(err) };
  }
  const base = await tenantBase(tenantKey);
  revalidatePath(base, 'layout');
  redirect(`${base}/admin/documents?deleted=1`);
}

/**
 * One file of a multi-file upload. The link name comes from the title; if it
 * is taken, a number is added (-2, -3…) instead of failing the whole batch.
 */
export async function bulkCreateDocumentAction(tenantKey: string, fd: FormData): Promise<{ id?: string; error?: string }> {
  const { ctx } = await requireStaff(tenantKey);
  const file = await fileFrom(fd);
  if (typeof file === 'string') return { error: file };
  const base = meta(fd);
  for (let n = 1; n <= 20; n++) {
    const slug = n === 1 ? base.slug : `${base.slug.slice(0, 76)}-${n}`;
    try {
      const doc = await createDocument(ctx, { ...base, slug }, file);
      if (str(fd, 'then') === 'publish') await transitionDocument(ctx, doc.id, 'publish');
      revalidatePath(`${await tenantBase(tenantKey)}/admin/documents`);
      return { id: doc.id };
    } catch (err) {
      if (err instanceof Error && /already uses the link/.test(err.message)) continue;
      return { error: message(err) };
    }
  }
  return { error: 'Could not find a free link name. Rename the file and try again.' };
}
