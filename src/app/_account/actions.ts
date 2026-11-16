'use server';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/request';
import { setPhoto, updateProfile } from '@/server/services/account';
import { ValidationError } from '@/server/errors';

export type AccountResult = { ok?: string; error?: string };

async function run(fn: (userId: string) => Promise<unknown>, ok: string): Promise<AccountResult> {
  const session = await getSession();
  if (!session) return { error: 'Your session ended. Sign in again.' };
  try {
    await fn(session.user.id);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    console.error(err);
    return { error: 'Something went wrong. Please try again.' };
  }
  // Name and photo show in every header, so refresh the whole app.
  revalidatePath('/', 'layout');
  return { ok };
}

export async function saveProfileAction(_: AccountResult, form: FormData): Promise<AccountResult> {
  return run((id) => updateProfile(id, { name: form.get('name') ?? '', phone: form.get('phone') ?? '' }), 'Saved.');
}

export async function savePhotoAction(dataUrl: string | null): Promise<AccountResult> {
  return run((id) => setPhoto(id, dataUrl), dataUrl ? 'Photo updated.' : 'Photo removed.');
}
