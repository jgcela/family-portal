// Client side of direct uploads (see src/server/services/uploads.ts).
// Files too big for a server request go straight to storage first; the form
// then carries a token instead of the file.

export type StartUpload = (fileName: string, sizeBytes: number) => Promise<{ token: string; putUrl: string } | { error: string }>;

/** PUTs the file to storage and returns the token, or an error message. */
export async function sendDirect(file: File, start: StartUpload): Promise<{ token: string } | { error: string }> {
  const t = await start(file.name, file.size);
  if ('error' in t) return t;
  let res: Response;
  try {
    res = await fetch(t.putUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
  } catch {
    // A network error here is almost always the storage bucket refusing the browser (CORS).
    return { error: 'The file could not be sent to storage. Check your connection and try again; if it keeps failing, the storage bucket needs its upload (CORS) setting.' };
  }
  if (!res.ok) return { error: `Storage refused the file (${res.status}). Try again.` };
  return { token: t.token };
}

/**
 * Before a form action runs: if its file is bigger than `inlineMax` bytes,
 * uploads it directly and swaps the file for a token in the form data.
 */
export async function withDirectUpload(fd: FormData, field: string, inlineMax: number, start: StartUpload): Promise<string | null> {
  const f = fd.get(field);
  if (!(f instanceof File) || f.size <= inlineMax) return null;
  const r = await sendDirect(f, start);
  if ('error' in r) return r.error;
  fd.delete(field);
  fd.set('uploadToken', r.token);
  fd.set('uploadName', f.name);
  return null;
}
