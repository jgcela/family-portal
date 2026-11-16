'use client';
import { useActionState, useRef, useState } from 'react';
import { saveProfileAction, savePhotoAction, type AccountResult } from './actions';
import { Avatar } from './avatar';

function Status({ r }: { r: AccountResult }) {
  if (r.error)
    return (
      <p className="field-error" role="alert">
        {r.error}
      </p>
    );
  if (r.ok)
    return (
      <p className="acct-ok" role="status">
        {r.ok}
      </p>
    );
  return null;
}

export function ProfileForm({ name, phone }: { name: string; phone: string }) {
  const [r, action, pending] = useActionState(saveProfileAction, {});
  return (
    <form action={action} className="acct-form">
      <div className="field">
        <label htmlFor="acct-name">Name</label>
        <input id="acct-name" name="name" defaultValue={name} autoComplete="name" maxLength={100} required />
      </div>
      <div className="field">
        <label htmlFor="acct-phone">Phone</label>
        <input id="acct-phone" name="phone" type="tel" defaultValue={phone} autoComplete="tel" maxLength={30} placeholder="(303) 555-0123" />
        <p className="hint">Optional. Never shown to other families.</p>
      </div>
      <Status r={r} />
      <div>
        <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

/** Shrinks the picture in the browser to a 256 px square, so only a small JPEG is sent. */
async function toSquareJpeg(file: File, size = 256): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d')!;
  c.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function PhotoForm({ name, image }: { name: string; image: string | null }) {
  const [current, setCurrent] = useState(image);
  const [r, setR] = useState<AccountResult>({});
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const save = async (dataUrl: string | null) => {
    setPending(true);
    const res = await savePhotoAction(dataUrl);
    setPending(false);
    setR(res);
    if (res.ok) setCurrent(dataUrl);
  };
  return (
    <div className="acct-photo">
      <Avatar name={name} image={current} size={72} />
      <div className="acct-photo-actions">
        <input
          ref={input}
          id="acct-photo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="visually-hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (f.size > 15 * 1024 * 1024) return setR({ error: 'Choose a picture under 15 MB.' });
            try {
              await save(await toSquareJpeg(f));
            } catch {
              setR({ error: 'That file could not be read as a picture. Try a JPEG or PNG.' });
            }
          }}
        />
        <button type="button" className="btn btn-quiet btn-sm" disabled={pending} onClick={() => input.current?.click()}>
          {pending ? 'Saving…' : current ? 'Change photo' : 'Add a photo'}
        </button>
        {current && (
          <button type="button" className="btn btn-quiet btn-sm" disabled={pending} onClick={() => save(null)}>
            Remove
          </button>
        )}
        <Status r={r} />
      </div>
    </div>
  );
}
