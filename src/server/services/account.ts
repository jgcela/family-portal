// The signed-in person's own profile: name, phone and photo. Email changes are
// not self-service yet: they need a confirmation email (see docs, Resend).
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { platformDb, type Db } from '../db/client';
import { user } from '../db/schema';
import { ValidationError } from '../errors';

export const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(100, 'Use at most 100 characters.'),
  phone: z
    .string()
    .trim()
    .max(30, 'Use at most 30 characters.')
    .refine((v) => v === '' || /^[+()\d\s.-]{7,30}$/.test(v), 'Use digits, spaces and + ( ) - only.'),
});

/** Photos are stored as a small JPEG/PNG/WebP data URL (resized in the browser to 256 px). */
export const MAX_PHOTO_CHARS = 120_000;
const PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

export async function getProfile(userId: string, db: Db = platformDb()) {
  const [u] = await db.select({ name: user.name, email: user.email, phone: user.phone, image: user.image }).from(user).where(eq(user.id, userId));
  if (!u) throw new ValidationError('Account not found.');
  return u;
}

export async function updateProfile(userId: string, input: unknown, db: Db = platformDb()) {
  const r = profileSchema.safeParse(input);
  if (!r.success) throw new ValidationError(r.error.issues[0]?.message ?? 'Check the form.');
  await db
    .update(user)
    .set({ name: r.data.name, phone: r.data.phone || null, updatedAt: new Date() })
    .where(eq(user.id, userId));
  return r.data;
}

export async function setPhoto(userId: string, dataUrl: string | null, db: Db = platformDb()) {
  if (dataUrl !== null && (dataUrl.length > MAX_PHOTO_CHARS || !PHOTO.test(dataUrl))) {
    throw new ValidationError('Use a JPEG, PNG or WebP image.');
  }
  await db.update(user).set({ image: dataUrl, updatedAt: new Date() }).where(eq(user.id, userId));
}
