// Account settings: name, phone and photo, each person only their own.
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb } from '@/server/db/client';
import { getProfile, setPhoto, updateProfile } from '@/server/services/account';
import { createUser } from './helpers';

afterAll(async () => {
  await closeDb();
});

describe('account profile', () => {
  it('saves name and phone, and clears an empty phone', async () => {
    const id = await createUser('Old Name');
    await updateProfile(id, { name: '  Sarah Johnson ', phone: '(303) 555-0123' });
    expect(await getProfile(id)).toMatchObject({ name: 'Sarah Johnson', phone: '(303) 555-0123' });
    await updateProfile(id, { name: 'Sarah', phone: '' });
    expect((await getProfile(id)).phone).toBeNull();
  });

  it('refuses an empty name or a phone with letters', async () => {
    const id = await createUser();
    await expect(updateProfile(id, { name: ' ', phone: '' })).rejects.toThrow(/Enter your name/);
    await expect(updateProfile(id, { name: 'A', phone: 'call me' })).rejects.toThrow(/digits/);
  });

  it('only accepts a small image data URL as photo, and can remove it', async () => {
    const id = await createUser();
    const ok = `data:image/jpeg;base64,${'A'.repeat(100)}`;
    await setPhoto(id, ok);
    expect((await getProfile(id)).image).toBe(ok);
    await expect(setPhoto(id, 'https://evil.example/x.png')).rejects.toThrow(/JPEG, PNG or WebP/);
    await expect(setPhoto(id, 'data:image/svg+xml;base64,PHN2Zz4=')).rejects.toThrow(/JPEG, PNG or WebP/);
    await expect(setPhoto(id, `data:image/png;base64,${'A'.repeat(200_000)}`)).rejects.toThrow(/JPEG, PNG or WebP/);
    await setPhoto(id, null);
    expect((await getProfile(id)).image).toBeNull();
  });
});
