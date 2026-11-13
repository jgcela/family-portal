'use server';
import { revalidatePath } from 'next/cache';
import { requireStaff, tenantBase } from '@/server/request';
import { addDomain, removeDomain, setPrimaryDomain, verifyDomain } from '@/server/services/domains';
import { errorMessage, str } from '../_components/action-helpers';

export type DomainResult = { error?: string; ok?: string } | undefined;

async function done(key: string) {
  revalidatePath(`${await tenantBase(key)}/admin/domains`);
}

export async function addDomainAction(key: string, _p: DomainResult, fd: FormData): Promise<DomainResult> {
  const { ctx } = await requireStaff(key);
  try {
    await addDomain(ctx, str(fd, 'hostname'));
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await done(key);
  return { ok: 'Added. Now create the DNS records below.' };
}

export async function verifyDomainAction(key: string, id: string): Promise<DomainResult> {
  const { ctx } = await requireStaff(key);
  try {
    const r = await verifyDomain(ctx, id);
    await done(key);
    return r.verified
      ? { ok: 'Verified.' }
      : { error: 'The TXT record was not found yet. DNS changes can take from a few minutes to a few hours; try again later.' };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function primaryDomainAction(key: string, id: string | null): Promise<DomainResult> {
  const { ctx } = await requireStaff(key);
  try {
    await setPrimaryDomain(ctx, id);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await done(key);
  return { ok: 'Saved.' };
}

export async function removeDomainAction(key: string, id: string): Promise<DomainResult> {
  const { ctx } = await requireStaff(key);
  try {
    await removeDomain(ctx, id);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  await done(key);
  return { ok: 'Removed.' };
}
