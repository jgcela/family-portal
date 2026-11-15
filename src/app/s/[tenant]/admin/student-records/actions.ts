'use server';
// Settings → Student records. The services check integrations.manage.
import { revalidatePath } from 'next/cache';
import { requireStaff, tenantBase } from '@/server/request';
import { addBlock, removeBlock, setPersonLink, testConnection, updateDirectorySettings } from '@/server/services/directory';
import { PROVIDERS } from '@/server/sis/connector';
import { errorMessage, str } from '../_components/action-helpers';
import type { OpsResult } from '../_ops/actions';

async function run(tenantKey: string, fn: (ctx: Awaited<ReturnType<typeof requireStaff>>['ctx']) => Promise<string | void>): Promise<OpsResult> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    const ok = await fn(ctx);
    revalidatePath(`${await tenantBase(tenantKey)}/admin/student-records`);
    return { ok: ok || 'Saved.' };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function saveSourceAction(tenantKey: string, _p: OpsResult, fd: FormData) {
  return run(tenantKey, async (ctx) => {
    // The OneRoster block is sent only when the school filled it in.
    const or = str(fd, 'orBaseUrl') || str(fd, 'orTokenUrl') || str(fd, 'orClientId') || str(fd, 'orClientSecret');
    await updateDirectorySettings(ctx, {
      source: str(fd, 'source'),
      factsApiKey: str(fd, 'factsApiKey'),
      oneroster: or
        ? { product: str(fd, 'orProduct'), version: str(fd, 'orVersion'), baseUrl: str(fd, 'orBaseUrl'), tokenUrl: str(fd, 'orTokenUrl'), clientId: str(fd, 'orClientId'), clientSecret: str(fd, 'orClientSecret') }
        : undefined,
    });
  });
}

export async function testConnectionAction(tenantKey: string, _p: OpsResult) {
  const { ctx } = await requireStaff(tenantKey);
  try {
    const r = await testConnection(ctx);
    revalidatePath(`${await tenantBase(tenantKey)}/admin/student-records`);
    const name = PROVIDERS[r.provider].name;
    return r.ok ? { ok: r.note ?? `${name} answered. The connection works.` } : { error: r.error ?? 'The connection test failed.' };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function personLinkAction(tenantKey: string, _p: OpsResult, fd: FormData) {
  return run(tenantKey, async (ctx) => {
    const id = str(fd, 'personId');
    await setPersonLink(ctx, str(fd, 'membershipId'), id || null);
    return id ? 'Linked.' : 'Link removed. The portal will look the parent up by email again.';
  });
}

export async function addBlockAction(tenantKey: string, _p: OpsResult, fd: FormData) {
  return run(tenantKey, async (ctx) => {
    await addBlock(ctx, { membershipId: str(fd, 'membershipId'), studentId: str(fd, 'studentId'), note: str(fd, 'note') });
    return 'Blocked. That account no longer sees this student.';
  });
}

export async function removeBlockAction(tenantKey: string, membershipId: string, studentKey: string, _p: OpsResult) {
  return run(tenantKey, async (ctx) => {
    await removeBlock(ctx, membershipId, studentKey);
    return 'Block removed.';
  });
}
