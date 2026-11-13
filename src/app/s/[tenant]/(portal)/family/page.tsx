// "My family": what is relevant to a signed-in family, in one place.
// Only portal content the school publishes; no student records (grades,
// attendance) — those live in the school's information system.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPortalView, getSession, getTenantOr404, getViewer, tenantBase } from '@/server/request';
import { listAudiences, listPublicOccurrences } from '@/server/services/calendar';
import { listPublicAnnouncements } from '@/server/services/content';
import { listPublicDocuments } from '@/server/services/documents';
import { addDays, toDateStr } from '@/server/calendar/time';
import { EventList } from '../calendar/event-list';
import { AnnouncementList } from '../updates/announcement-list';
import { fileLabel, formatBytes } from '../../admin/documents/shared';
import { PasswordForm } from './password-form';

export const metadata = { title: 'My family' };

export default async function MyFamily({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const base = await tenantBase(key);
  const viewer = await getViewer(tenant.id);
  if (viewer.kind !== 'family') redirect(`${base}/account`);
  const [view, session, audiences] = await Promise.all([getPortalView(tenant.id), getSession(), listAudiences(tenant.id)]);
  const active = new Set(view.activeModules.map((m) => m.id));
  const mine = new Set(viewer.audienceIds);
  const gradeAudiences = audiences.filter((a) => a.kind === 'grade' && mine.has(a.id));
  const forMe = (ids: string[]) => ids.length > 0 && ids.some((id) => mine.has(id));
  const today = toDateStr(new Date(), tenant.timezone);

  const [events, updates, docs] = await Promise.all([
    active.has('calendar') ? listPublicOccurrences(tenant.id, viewer, { from: today, to: addDays(today, 30) }, { audienceIds: [...viewer.audienceIds] }) : [],
    active.has('announcements') ? listPublicAnnouncements(tenant.id, viewer, { audienceIds: [...viewer.audienceIds], limit: 30 }) : [],
    active.has('documents') ? listPublicDocuments(tenant.id, viewer) : [],
  ]);
  // Family pages show what is aimed at this family: their grades, or family-only items for everyone.
  const myEvents = events.filter((e) => forMe(e.audienceIds));
  const myUpdates = updates.filter((u) => forMe(u.audienceIds) || u.visibility === 'families');
  const myDocs = docs.filter((d) => forMe(d.audienceIds) || d.visibility === 'families');
  const firstName = session?.user.name.split(' ')[0];

  return (
    <div className="container content-page family-page">
      <p className="home-eyebrow">My family</p>
      <h1>{firstName ? `Hello, ${firstName}` : 'My family'}</h1>
      <p className="family-grades-line">
        {gradeAudiences.length ? (
          <>
            Showing information for{' '}
            {gradeAudiences.map((g, i) => (
              <span key={g.id}>
                {i > 0 && (i === gradeAudiences.length - 1 ? ' and ' : ', ')}
                <strong>{g.name}</strong>
              </span>
            ))}
            .
          </>
        ) : (
          'No grades are linked to your account yet.'
        )}{' '}
        <span className="muted">Wrong grade? Contact the school office.</span>
      </p>

      <div className="family-grid">
        {active.has('calendar') && (
          <section className="card home-block" aria-labelledby="fam-events">
            <div className="section-title">
              <h2 id="fam-events">Coming up for your grades</h2>
              <Link href={`${base}/calendar`}>Full calendar</Link>
            </div>
            <EventList items={myEvents.slice(0, 8)} base={base} tz={tenant.timezone} emptyText="Nothing for your grades in the next 30 days." />
          </section>
        )}
        {active.has('announcements') && (
          <section className="card home-block" aria-labelledby="fam-updates">
            <div className="section-title">
              <h2 id="fam-updates">Updates for your family</h2>
              <Link href={`${base}/updates`}>All updates</Link>
            </div>
            <AnnouncementList items={myUpdates.slice(0, 6)} base={base} tz={tenant.timezone} emptyText="No family updates right now." />
          </section>
        )}
        {active.has('documents') && (
          <section className="card home-block" aria-labelledby="fam-docs">
            <div className="section-title">
              <h2 id="fam-docs">Documents for your family</h2>
              <Link href={`${base}/documents`}>All documents</Link>
            </div>
            {myDocs.length === 0 ? (
              <p className="empty">No documents for your grades yet.</p>
            ) : (
              <ul className="doc-list">
                {myDocs.map((d) => (
                  <li key={d.slug}>
                    <a href={`${base}/d/${d.slug}`} target="_blank" rel="noopener">
                      <span className="doc-title">{d.title}</span>
                      <span className="doc-meta">
                        {fileLabel(d.contentType)} · {formatBytes(d.sizeBytes)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <section className="card home-block" aria-labelledby="fam-account">
          <div className="section-title">
            <h2 id="fam-account">Your account</h2>
          </div>
          <p>
            {session?.user.name} · {session?.user.email}
          </p>
          <PasswordForm />
        </section>
      </div>
    </div>
  );
}
