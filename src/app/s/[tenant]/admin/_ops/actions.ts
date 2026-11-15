'use server';
// Server actions for the operations screens (inbox, students, workflows).
// Every action reloads the staff context; the services enforce permissions.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { addComment, bulkUpdate, deleteTemplate, deleteView, parseFilters, saveTemplate, saveView, updateInboxItem } from '@/server/services/inbox';
import { markRecordedInSis, reviewNotice } from '@/server/services/attendance';
import { importStudents, removeGuardian, saveStudent, setGuardian } from '@/server/services/students';
import { createFromTemplate, deleteWorkflow, updateWorkflow } from '@/server/services/workflows';
import { errorMessage, ids, str } from '../_components/action-helpers';

export type OpsResult = { error?: string; ok?: string } | undefined;

async function run(tenantKey: string, path: string, fn: (ctx: Awaited<ReturnType<typeof requireStaff>>['ctx']) => Promise<string | void>): Promise<OpsResult> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    const ok = await fn(ctx);
    revalidatePath(`${await tenantBase(tenantKey)}/admin/${path}`);
    return { ok: ok || 'Saved.' };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v === '' ? null : Number(v);
};

// ---------- Inbox ----------

export async function updateItemAction(tenantKey: string, id: string, _p: OpsResult, fd: FormData) {
  return run(tenantKey, `inbox/${id}`, async (ctx) => {
    const assignee = str(fd, 'assigneeUserId');
    await updateInboxItem(ctx, id, {
      status: str(fd, 'status') || undefined,
      priority: str(fd, 'priority') || undefined,
      assigneeUserId: fd.has('assigneeUserId') ? assignee || null : undefined,
    });
  });
}

export async function commentAction(tenantKey: string, id: string, _p: OpsResult, fd: FormData) {
  return run(tenantKey, `inbox/${id}`, async (ctx) => {
    const toFamily = str(fd, 'mode') !== 'note';
    await addComment(ctx, id, { body: str(fd, 'body'), toFamily, waitForFamily: fd.get('wait') === 'on' });
    return toFamily ? 'Reply sent. The family sees it on their request page.' : 'Note added (staff only).';
  });
}

export async function reviewAction(tenantKey: string, itemId: string, noticeId: string, _p: OpsResult, fd: FormData) {
  return run(tenantKey, `inbox/${itemId}`, async (ctx) => {
    const op = str(fd, 'op');
    if (op === 'sis') {
      await markRecordedInSis(ctx, noticeId);
      return 'Marked as entered in the SIS.';
    }
    if (op !== 'start' && op !== 'approve' && op !== 'reject' && op !== 'cancel') throw new Error('bad op');
    await reviewNotice(ctx, noticeId, op, str(fd, 'note') || null);
    return op === 'approve' ? 'Accepted. The family can see it.' : op === 'reject' ? 'Declined. The family can see your reason.' : op === 'start' ? 'Marked as being reviewed.' : 'Cancelled.';
  });
}

export async function bulkAction(tenantKey: string, _p: OpsResult, fd: FormData) {
  return run(tenantKey, 'inbox', async (ctx) => {
    const op = str(fd, 'op');
    const change =
      op === 'mine' ? { assigneeUserId: ctx.userId } : op === 'assign' ? { assigneeUserId: str(fd, 'bulkAssignee') || null } : op === 'priority' ? { priority: str(fd, 'bulkPriority') } : { status: op };
    const r = await bulkUpdate(ctx, ids(fd, 'ids'), change);
    return `${r.changed} updated.${r.skipped.length ? ` Not changed: ${r.skipped.slice(0, 5).join('; ')}${r.skipped.length > 5 ? '…' : ''}` : ''}`;
  });
}

export async function saveViewAction(tenantKey: string, query: string, _p: OpsResult, fd: FormData) {
  return run(tenantKey, 'inbox', async (ctx) => {
    await saveView(ctx, str(fd, 'name'), parseFilters(Object.fromEntries(new URLSearchParams(query))));
    return 'View saved.';
  });
}

export async function deleteViewAction(tenantKey: string, id: string) {
  return run(tenantKey, 'inbox', async (ctx) => {
    await deleteView(ctx, id);
  });
}

export async function saveTemplateAction(tenantKey: string, id: string | null, _p: OpsResult, fd: FormData) {
  return run(tenantKey, 'inbox/templates', async (ctx) => {
    await saveTemplate(ctx, id, { title: str(fd, 'title'), body: str(fd, 'body') });
    return 'Template saved.';
  });
}

export async function deleteTemplateAction(tenantKey: string, id: string) {
  return run(tenantKey, 'inbox/templates', async (ctx) => {
    await deleteTemplate(ctx, id);
  });
}

// ---------- Students ----------

export async function saveStudentAction(tenantKey: string, id: string | null, _p: OpsResult, fd: FormData) {
  const res = await run(tenantKey, 'students', async (ctx) => {
    const s = await saveStudent(ctx, id, {
      firstName: str(fd, 'firstName'),
      lastName: str(fd, 'lastName'),
      preferredName: str(fd, 'preferredName'),
      gradeId: str(fd, 'gradeId') || null,
      externalId: str(fd, 'externalId'),
      status: str(fd, 'status') || 'active',
    });
    if (!id) return `created:${s.id}`;
  });
  if (res?.ok?.startsWith('created:')) redirect(`${await tenantBase(tenantKey)}/admin/students/${res.ok.slice(8)}?created=1`);
  return res;
}

export async function setGuardianAction(tenantKey: string, studentId: string, _p: OpsResult, fd: FormData) {
  return run(tenantKey, `students/${studentId}`, async (ctx) => {
    await setGuardian(ctx, studentId, {
      membershipId: str(fd, 'membershipId'),
      relationship: str(fd, 'relationship') || 'Parent/guardian',
      access: str(fd, 'access') || 'active',
      canSubmitAttendance: fd.get('canSubmitAttendance') === 'on',
      canViewStudent: fd.get('canViewStudent') === 'on',
      restrictionNote: str(fd, 'restrictionNote'),
    });
    return 'Guardian saved.';
  });
}

export async function removeGuardianAction(tenantKey: string, studentId: string, membershipId: string) {
  return run(tenantKey, `students/${studentId}`, async (ctx) => {
    await removeGuardian(ctx, studentId, membershipId);
    return 'Guardian removed.';
  });
}

export async function importStudentsAction(tenantKey: string, _p: OpsResult, fd: FormData) {
  return run(tenantKey, 'students', async (ctx) => {
    const f = fd.get('file');
    if (!(f instanceof File) || f.size === 0) throw new (await import('@/server/errors')).ValidationError('Choose a CSV file.');
    if (f.size > 2_000_000) throw new (await import('@/server/errors')).ValidationError('The file is too large (2 MB at most).');
    const r = await importStudents(ctx, await f.text());
    return `${r.created} added, ${r.updated} updated, ${r.linked} guardian links.${r.problems.length ? ` Check: ${r.problems.slice(0, 8).join(' ')}${r.problems.length > 8 ? ` (+${r.problems.length - 8} more)` : ''}` : ''}`;
  });
}

// ---------- Workflows ----------

export async function createWorkflowAction(tenantKey: string, templateKey: string): Promise<OpsResult> {
  const res = await run(tenantKey, 'workflows', async (ctx) => {
    const w = await createFromTemplate(ctx, templateKey);
    return `created:${w.id}`;
  });
  if (res?.ok?.startsWith('created:')) redirect(`${await tenantBase(tenantKey)}/admin/workflows/${res.ok.slice(8)}`);
  return res;
}

export async function saveWorkflowAction(tenantKey: string, id: string, _p: OpsResult, fd: FormData) {
  return run(tenantKey, `workflows/${id}`, async (ctx) => {
    await updateWorkflow(ctx, id, {
      name: str(fd, 'name'),
      enabled: fd.get('enabled') === 'on',
      sortOrder: num(fd, 'sortOrder') ?? 100,
      config: {
        match: {
          types: ids(fd, 'types'),
          reasons: ids(fd, 'reasons'),
          gradeIds: ids(fd, 'gradeIds'),
          maxDays: num(fd, 'maxDays'),
        },
        action: str(fd, 'action') || 'route',
        assigneeUserId: str(fd, 'assigneeUserId') || null,
        priority: str(fd, 'priority') || 'normal',
        dueInHours: num(fd, 'dueInHours') ?? 24,
        escalateAfterHours: num(fd, 'escalateAfterHours'),
        escalateToUserId: str(fd, 'escalateToUserId') || null,
        familyMessage: str(fd, 'familyMessage'),
      },
    });
    return 'Rule saved.';
  });
}

export async function deleteWorkflowAction(tenantKey: string, id: string) {
  const res = await run(tenantKey, 'workflows', async (ctx) => {
    await deleteWorkflow(ctx, id);
  });
  if (res?.ok) redirect(`${await tenantBase(tenantKey)}/admin/workflows`);
  return res;
}
