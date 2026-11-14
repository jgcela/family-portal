import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPortalView, getTenantOr404, getViewer, tenantBase } from '@/server/request';
import { countFamilyOnlyVolunteer, listPublicVolunteer } from '@/server/services/volunteer';
import { OpportunityCard } from './opportunity-card';

export const metadata = { title: 'Volunteer' };

export default async function VolunteerPage({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const view = await getPortalView(tenant.id);
  if (!view.activeModules.some((m) => m.id === 'volunteer')) notFound();
  const viewer = await getViewer(tenant.id);
  const [items, base, hidden] = await Promise.all([
    listPublicVolunteer(tenant.id, viewer),
    tenantBase(key),
    viewer.kind === 'public' ? countFamilyOnlyVolunteer(tenant.id) : Promise.resolve(0),
  ]);
  const groups = new Map<string, typeof items>();
  for (const o of items) {
    const g = o.category ?? 'Other';
    groups.set(g, [...(groups.get(g) ?? []), o]);
  }
  return (
    <div className="container content-page">
      <h1>Volunteer</h1>
      <p className="muted">Ways to help at school, with who to contact and where to sign up.</p>
      {hidden > 0 && (
        <div className="notice">
          {hidden === 1 ? 'One more opportunity is' : `${hidden} more opportunities are`} only for {view.profile.shortName ?? view.profile.displayName} families.{' '}
          <Link href={`${base}/login?next=${encodeURIComponent(`${base}/volunteer`)}`}>Sign in</Link> to see {hidden === 1 ? 'it' : 'them'} and the
          contact details.
        </div>
      )}
      {items.length === 0 ? (
        hidden === 0 && <p className="muted">No volunteer opportunities right now.</p>
      ) : groups.size > 1 ? (
        [...groups].map(([g, list]) => (
          <section key={g} className="vol-group" aria-labelledby={`g-${g}`}>
            <h2 id={`g-${g}`}>{g}</h2>
            <div className="vol-grid">
              {list.map((o) => (
                <OpportunityCard key={o.id} o={o} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="vol-grid">
          {items.map((o) => (
            <OpportunityCard key={o.id} o={o} />
          ))}
        </div>
      )}
    </div>
  );
}
