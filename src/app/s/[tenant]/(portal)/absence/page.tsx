import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPortalView, getTenantOr404, getViewer, tenantBase } from '@/server/request';
import { myChildren } from '@/server/services/students';
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
  const kids = (await myChildren(tenant.id, viewer)).filter((c) => c.canSubmitAttendance);
  return (
    <div className="container content-page ops-page">
      <h1>Report an absence</h1>
      <p className="section-intro">Tell the office before school starts. You&apos;ll get a reference and can follow the notice under My requests.</p>
      {kids.length === 0 ? (
        <p className="notice">
          Your account isn&apos;t linked to a child who you can report absences for yet. Please contact the office{phone ? ` at ${phone}` : ''} so they can link it.
        </p>
      ) : (
        <AbsenceForm tenantKey={key} base={base} children={kids} idempotencyKey={randomUUID()} today={toDateStr(new Date(), tenant.timezone)} />
      )}
      <p className="hint">For emergencies, call the school{phone ? ` at ${phone}` : ''} or 911.</p>
    </div>
  );
}
