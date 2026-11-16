import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPortalView, getTenantOr404, getViewer, tenantBase } from '@/server/request';
import { DirectoryUnavailableError, familyChildren, type Child } from '@/server/services/directory';
import { toDateStr } from '@/server/calendar/time';
import { AbsenceForm } from './absence-form';

export const metadata = { title: 'Report an absence' };
export const dynamic = 'force-dynamic';

export default async function AbsencePage({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const [view, viewer, base] = await Promise.all([getPortalView(tenant.id), getViewer(tenant.id), tenantBase(key)]);
  if (!view.activeModules.some((m) => m.id === 'attendance_notices')) notFound();
  const phone = view.profile.phone;
  if (viewer.kind !== 'family') {
    return (
      <div className="container content-page ops-page">
        <h1>Report an absence</h1>
        <p>
          <Link href={`${base}/login?next=${encodeURIComponent(`${base}/absence`)}`}>Sign in with your family account</Link> to report an absence, a late arrival or an early dismissal.
          {phone ? ` You can also call the office at ${phone}.` : ''}
        </p>
      </div>
    );
  }
  let kids: Child[] = [];
  let unavailable: string | null = null;
  try {
    kids = (await familyChildren(tenant.id, viewer)).filter((c) => c.canSubmitAttendance);
  } catch (err) {
    if (!(err instanceof DirectoryUnavailableError)) throw err;
    unavailable = err.message;
  }
  return (
    <div className="container content-page ops-page">
      <h1>Report an absence</h1>
      <p className="section-intro">Tell the office before school starts. You&apos;ll get a reference and can follow the notice under My requests.</p>
      {unavailable ? (
        <p className="notice notice-error" role="alert">
          {unavailable}
          {phone ? ` Office: ${phone}.` : ''}
        </p>
      ) : kids.length === 0 ? (
        <p className="notice">
          We couldn&apos;t find a child you can report absences for. The school&apos;s records may list a different email for you. Please contact the office{phone ? ` at ${phone}` : ''}.
        </p>
      ) : (
        <AbsenceForm tenantKey={key} base={base} children={kids.map((c) => ({ id: c.key, name: c.name, grade: c.grade }))} idempotencyKey={randomUUID()} today={toDateStr(new Date(), tenant.timezone)} />
      )}
      <p className="hint">For emergencies, call the school{phone ? ` at ${phone}` : ''} or 911.</p>
    </div>
  );
}
