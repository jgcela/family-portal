'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff, tenantBase, getTenantOr404 } from '@/server/request';
import {
  createTextSource,
  deleteTextSource,
  readQuestionLog,
  refreshKnowledge,
  setSourceStatus,
  updateAiSettings,
  updateSource,
} from '@/server/services/knowledge';
import { askSchool } from '@/server/services/assistant';
import { loadSandboxViewer } from '@/server/viewer';
import { assertCan } from '@/server/rbac/authorize';
import { errorMessage, ids, str } from '../_components/action-helpers';
import type { AskState } from '@/app/_ai/answer-view';

type Result = { error?: string; ok?: string } | undefined;

export async function refreshAction(tenantKey: string, _p: Result, _fd: FormData): Promise<Result> {
  const { ctx, tenant } = await requireStaff(tenantKey);
  try {
    assertCan(ctx, 'ai.knowledge.manage');
    if (ctx.support) return { error: 'Support sessions are read-only.' };
    const r = await refreshKnowledge(tenant.id, { userId: ctx.userId });
    revalidatePath(`${await tenantBase(tenantKey)}/admin/ai`);
    return {
      ok: `${r.created} new suggested source${r.created === 1 ? '' : 's'}, ${r.indexed} checked.${r.waiting ? ` ${r.waiting} still waiting: refresh again to continue.` : ''}`,
    };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function bulkStatusAction(tenantKey: string, _p: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  const op = str(fd, 'op');
  if (op !== 'approved' && op !== 'removed' && op !== 'pending') return { error: 'Choose an action.' };
  try {
    const r = await setSourceStatus(ctx, ids(fd, 'ids'), op);
    revalidatePath(`${await tenantBase(tenantKey)}/admin/ai`);
    const verb = op === 'approved' ? 'Approved' : op === 'removed' ? 'Removed' : 'Moved back to suggested';
    return {
      ok: `${verb}: ${r.changed}.${r.skipped.length ? ` Not approved because they are not indexed yet: ${r.skipped.join(', ')}.` : ''}`,
    };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const bool = (fd: FormData, k: string) => fd.get(k) === 'on';

export async function saveSourceAction(tenantKey: string, id: string | null, kind: 'faq' | 'text' | null, _p: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  const base = await tenantBase(tenantKey);
  try {
    const common = {
      topic: str(fd, 'topic') || undefined,
      authoritative: bool(fd, 'authoritative'),
      effectiveDate: str(fd, 'effectiveDate'),
      reviewBy: str(fd, 'reviewBy'),
    };
    const own = fd.has('body')
      ? { title: str(fd, 'title'), body: str(fd, 'body'), visibility: str(fd, 'visibility') || 'families', audienceIds: ids(fd, 'audienceIds'), url: str(fd, 'url') }
      : {};
    if (id) await updateSource(ctx, id, { ...common, ...own });
    else await createTextSource(ctx, { kind, ...common, ...own });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(`${base}/admin/ai`);
  redirect(`${base}/admin/ai?saved=1`);
}

export async function deleteSourceAction(tenantKey: string, id: string, _p: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  if (str(fd, 'confirm').toLowerCase() !== 'delete') return { error: 'Type "delete" to confirm.' };
  try {
    await deleteTextSource(ctx, id);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  const base = await tenantBase(tenantKey);
  revalidatePath(`${base}/admin/ai`);
  redirect(`${base}/admin/ai?deleted=1`);
}

export async function saveSettingsAction(tenantKey: string, _p: Result, fd: FormData): Promise<Result> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    const topics = fd.getAll('c_topic');
    const names = fd.getAll('c_name');
    const emails = fd.getAll('c_email');
    const contacts = topics
      .map((t, i) => ({ topic: String(t), name: String(names[i] ?? '').trim(), email: String(emails[i] ?? '').trim() }))
      .filter((c) => c.name || c.email);
    await updateAiSettings(ctx, {
      familiesEnabled: bool(fd, 'familiesEnabled'),
      publicEnabled: bool(fd, 'publicEnabled'),
      retentionDays: str(fd, 'retentionDays'),
      storeQuestionText: bool(fd, 'storeQuestionText'),
      escalationContacts: contacts,
    });
    const base = await tenantBase(tenantKey);
    revalidatePath(base, 'layout');
    return { ok: 'Settings saved.' };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function sandboxAskAction(tenantKey: string, _p: AskState, fd: FormData): Promise<AskState> {
  const { ctx, user } = await requireStaff(tenantKey);
  const tenant = await getTenantOr404(tenantKey);
  const question = str(fd, 'question');
  try {
    const mode = str(fd, 'as');
    const as = mode === 'public' || mode === 'staff' ? mode : 'family';
    const viewer = await loadSandboxViewer(tenant.id, user.id, as, ids(fd, 'gradeIds'));
    const result = await askSchool({ tenantId: tenant.id, viewer, question, sandbox: { ctx, includePending: bool(fd, 'includePending') } });
    return { result, question };
  } catch (err) {
    return { error: errorMessage(err), question };
  }
}

export type LogState = { error?: string; rows?: Awaited<ReturnType<typeof readQuestionLog>> } | undefined;

export async function readLogAction(tenantKey: string, _p: LogState, fd: FormData): Promise<LogState> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    const outcome = str(fd, 'outcome');
    const rows = await readQuestionLog(ctx, str(fd, 'reason'), { outcome: outcome === 'no_answer' || outcome === 'answered' ? outcome : undefined });
    return { rows };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
