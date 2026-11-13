'use server';
import { revalidatePath } from 'next/cache';
import { requireStaff, tenantBase } from '@/server/request';
import { discardThemeDraft, publishThemeDraft, restoreThemeVersion, saveThemeDraft } from '@/server/services/theme';
import {
  discardHomepageDraft,
  publishHomepageDraft,
  restoreHomepageVersion,
  saveHomepageDraft,
} from '@/server/services/homepage';
import { ValidationError } from '@/server/services/modules';
import { errorMessage, str } from '../_components/action-helpers';

export type DesignResult = { error?: string; ok?: string; at?: number } | undefined;

function json(fd: FormData, key: string): unknown {
  try {
    return JSON.parse(str(fd, key));
  } catch {
    throw new ValidationError('The form data could not be read. Reload the page and try again.');
  }
}

async function done(tenantKey: string, ok: string): Promise<DesignResult> {
  revalidatePath(await tenantBase(tenantKey), 'layout');
  return { ok, at: Date.now() };
}

// ---- Theme ---------------------------------------------------------------

export async function saveThemeAction(tenantKey: string, _prev: DesignResult, fd: FormData): Promise<DesignResult> {
  const { ctx } = await requireStaff(tenantKey);
  const then = str(fd, 'then');
  try {
    await saveThemeDraft(ctx, json(fd, 'tokens'));
    if (then === 'publish') await publishThemeDraft(ctx);
  } catch (err) {
    return { error: errorMessage(err), at: Date.now() };
  }
  return done(tenantKey, then === 'publish' ? 'Published. Families now see the new look.' : 'Draft saved.');
}

export async function discardThemeAction(tenantKey: string): Promise<DesignResult> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await discardThemeDraft(ctx);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  return done(tenantKey, 'Draft discarded.');
}

export async function restoreThemeAction(tenantKey: string, versionId: string): Promise<DesignResult> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await restoreThemeVersion(ctx, versionId);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  return done(tenantKey, 'That version is now the draft. Publish it to make it live.');
}

// ---- Homepage ------------------------------------------------------------

export async function saveHomepageAction(tenantKey: string, _prev: DesignResult, fd: FormData): Promise<DesignResult> {
  const { ctx } = await requireStaff(tenantKey);
  const then = str(fd, 'then');
  try {
    await saveHomepageDraft(ctx, json(fd, 'blocks'));
    if (then === 'publish') await publishHomepageDraft(ctx);
  } catch (err) {
    return { error: errorMessage(err), at: Date.now() };
  }
  return done(tenantKey, then === 'publish' ? 'Published. Families now see the new homepage.' : 'Draft saved.');
}

export async function discardHomepageAction(tenantKey: string): Promise<DesignResult> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await discardHomepageDraft(ctx);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  return done(tenantKey, 'Draft discarded.');
}

export async function restoreHomepageAction(tenantKey: string, versionId: string): Promise<DesignResult> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await restoreHomepageVersion(ctx, versionId);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  return done(tenantKey, 'That version is now the draft. Publish it to make it live.');
}
