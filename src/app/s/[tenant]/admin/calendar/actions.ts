'use server';
// Server actions for Calendar & Events. Each one re-resolves the tenant and the
// signed-in user on the server; nothing from the form decides which school.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { AuthorizationError } from '@/server/rbac/authorize';
import { ValidationError } from '@/server/services/modules';
import {
  commitImport,
  createCalendar,
  createEvent,
  deleteEvent,
  previewImport,
  transitionEvent,
  updateCalendar,
  updateEvent,
  type EventTransition,
  type ImportPreview,
} from '@/server/services/calendar';
import { guessCsvMapping, readCsvHeaders, type CsvMapping } from '@/server/calendar/parse';

export type FormState = { error?: string; ok?: string } | undefined;

function message(err: unknown): string {
  if (err instanceof ValidationError) return err.message;
  if (err instanceof AuthorizationError) return 'You do not have permission to do that.';
  console.error(err);
  return 'Something went wrong. Please try again.';
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

/** Builds an RRULE from the simple repeat controls, or takes a custom rule. */
function rruleFrom(fd: FormData): string | null {
  const repeat = str(fd, 'repeat');
  if (!repeat || repeat === 'none') return null;
  if (repeat === 'custom') return str(fd, 'rrule') || null;
  const parts = [`FREQ=${repeat.toUpperCase()}`];
  const interval = Number(str(fd, 'interval') || '1');
  if (interval > 1) parts.push(`INTERVAL=${Math.min(interval, 52)}`);
  if (repeat === 'weekly') {
    const days = fd.getAll('byday').filter((d): d is string => typeof d === 'string' && /^(MO|TU|WE|TH|FR|SA|SU)$/.test(d));
    if (days.length) parts.push(`BYDAY=${days.join(',')}`);
  }
  const until = str(fd, 'until');
  const count = str(fd, 'count');
  if (until) parts.push(`UNTIL=${until.replace(/-/g, '')}`);
  else if (count) parts.push(`COUNT=${Math.min(Number(count) || 1, 500)}`);
  return parts.join(';');
}

function eventInput(fd: FormData) {
  const allDay = fd.get('allDay') === 'on';
  return {
    calendarId: str(fd, 'calendarId'),
    title: str(fd, 'title'),
    description: str(fd, 'description') || null,
    location: str(fd, 'location') || null,
    category: str(fd, 'category') || null,
    allDay,
    startDate: str(fd, 'startDate'),
    endDate: str(fd, 'endDate') || null,
    startTime: allDay ? null : str(fd, 'startTime') || null,
    endTime: allDay ? null : str(fd, 'endTime') || null,
    timezone: str(fd, 'timezone'),
    rrule: rruleFrom(fd),
    exdates: str(fd, 'exdates')
      .split(/[\s,]+/)
      .filter(Boolean),
    registrationUrl: str(fd, 'registrationUrl') || null,
    audienceIds: fd.getAll('audienceIds').filter((v): v is string => typeof v === 'string'),
    visibility: (fd.get('visibility') as string | null) || 'public',
    isImportant: fd.get('isImportant') === 'on',
  };
}

export async function saveEventAction(tenantKey: string, eventId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const { ctx } = await requireStaff(tenantKey);
  const base = await tenantBase(tenantKey);
  let id: string;
  try {
    const input = eventInput(fd);
    id = eventId ? (await updateEvent(ctx, eventId, input)).id : (await createEvent(ctx, input)).id;
    const then = str(fd, 'then');
    if (then === 'publish' || then === 'submit') await transitionEvent(ctx, id, then);
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath(`${base}/admin/calendar`);
  redirect(`${base}/admin/calendar/${id}?saved=1`);
}

export async function transitionEventAction(tenantKey: string, eventId: string, action: EventTransition, _prev: FormState): Promise<FormState> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await transitionEvent(ctx, eventId, action);
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath(`${await tenantBase(tenantKey)}/admin/calendar`, 'layout');
  return { ok: 'Done.' };
}

export async function deleteEventAction(tenantKey: string, eventId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { ctx } = await requireStaff(tenantKey);
  if (str(fd, 'confirm') !== 'delete') return { error: 'Type "delete" to confirm.' };
  try {
    await deleteEvent(ctx, eventId);
  } catch (err) {
    return { error: message(err) };
  }
  const base = await tenantBase(tenantKey);
  revalidatePath(`${base}/admin/calendar`);
  redirect(`${base}/admin/calendar?deleted=1`);
}

export async function saveCalendarAction(tenantKey: string, calendarId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const { ctx } = await requireStaff(tenantKey);
  const input = {
    name: str(fd, 'name'),
    description: str(fd, 'description') || null,
    color: str(fd, 'color'),
    isPublic: fd.get('isPublic') === 'on',
    sortOrder: Number(str(fd, 'sortOrder') || '0'),
  };
  try {
    if (calendarId) await updateCalendar(ctx, calendarId, input);
    else await createCalendar(ctx, { ...input, key: str(fd, 'key') });
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath(`${await tenantBase(tenantKey)}/admin/calendar/calendars`);
  return { ok: calendarId ? 'Calendar saved.' : 'Calendar created.' };
}

// ---------- Import wizard ----------

export type ImportState =
  | { step: 'upload'; error?: string }
  | { step: 'map'; error?: string; headers: string[]; mapping: CsvMapping; text: string; fileName: string; calendarId: string; timezone: string }
  | { step: 'preview'; error?: string; preview: ImportPreview; fileName: string }
  | { step: 'done'; result: { created: number; updated: number; cancelled: number; skipped: number } };

const MAX_BYTES = 3_900_000;

export async function previewImportAction(tenantKey: string, prev: ImportState, fd: FormData): Promise<ImportState> {
  const { ctx } = await requireStaff(tenantKey);
  const calendarId = str(fd, 'calendarId');
  const timezone = str(fd, 'timezone');
  let text = str(fd, 'text');
  let fileName = str(fd, 'fileName');
  const file = fd.get('file');
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return { step: 'upload', error: 'File is too large (about 4 MB maximum).' };
    text = await file.text();
    fileName = file.name.slice(0, 255);
  }
  if (!text) return { step: 'upload', error: 'Choose a .ics or .csv file.' };
  const isCsv = /\.csv$/i.test(fileName) || (!/BEGIN:VCALENDAR/i.test(text.slice(0, 2000)) && text.includes(','));

  if (isCsv && prev.step !== 'map') {
    const headers = readCsvHeaders(text);
    if (!headers.length) return { step: 'upload', error: 'This CSV file has no header row.' };
    return { step: 'map', headers, mapping: guessCsvMapping(headers), text, fileName, calendarId, timezone };
  }
  const mapping: CsvMapping = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith('map:') && typeof v === 'string' && v) mapping[k.slice(4) as keyof CsvMapping] = v;
  }
  try {
    const preview = await previewImport(ctx, {
      calendarId,
      kind: isCsv ? 'csv_file' : 'ics_file',
      fileName,
      text,
      timezone,
      csvMapping: isCsv ? mapping : undefined,
    });
    return { step: 'preview', preview, fileName };
  } catch (err) {
    if (prev.step === 'map') return { ...prev, mapping, error: message(err) };
    return { step: 'upload', error: message(err) };
  }
}

export async function commitImportAction(tenantKey: string, prev: ImportState, fd: FormData): Promise<ImportState> {
  const { ctx } = await requireStaff(tenantKey);
  if (prev.step !== 'preview') return { step: 'upload', error: 'Start again by choosing a file.' };
  try {
    const result = await commitImport(ctx, prev.preview.importId, {
      audienceIds: fd.getAll('audienceIds').filter((v): v is string => typeof v === 'string'),
      publish: str(fd, 'status') === 'published',
      includeDuplicateRows: fd
        .getAll('includeRow')
        .map((v) => Number(v))
        .filter(Number.isInteger),
    });
    revalidatePath(`${await tenantBase(tenantKey)}/admin/calendar`);
    return { step: 'done', result };
  } catch (err) {
    return { ...prev, error: message(err) };
  }
}
