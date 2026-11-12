import { getPortalView, getSession, getTenantOr404 } from '@/server/request';
import type { HomepageBlock } from '@/server/tenancy/homepage-defaults';

// Which module supplies each homepage block. Blocks whose module is not active
// for the school are skipped, so families never see empty placeholders.
const BLOCK_SOURCE: Partial<Record<HomepageBlock['type'], string>> = {
  'action-required': 'action_required',
  'this-week': 'calendar',
  'upcoming-events': 'calendar',
  'school-updates': 'announcements',
  newsletter: 'messenger',
  'featured-resources': 'resources',
  'quick-access': 'quick_links',
  volunteer: 'volunteer',
  'your-children': 'student_profiles',
};

type Props = { params: Promise<{ tenant: string }> };

export default async function FamilyHome({ params }: Props) {
  const tenant = await getTenantOr404((await params).tenant);
  const [view, session] = await Promise.all([getPortalView(tenant.id), getSession()]);
  const active = new Set(view.activeModules.map((m) => m.id));
  const blocks = view.homepage.filter((b) => {
    if (!b.enabled) return false;
    const source = BLOCK_SOURCE[b.type];
    return !source || active.has(source);
  });
  const content = blocks.filter((b) => b.type !== 'welcome');
  const p = view.profile;
  const firstName = session?.user.name?.split(' ')[0];

  return (
    <div className="container">
      {blocks.map((b) =>
        b.type === 'welcome' ? (
          <section key={b.id} className="home-hero" aria-labelledby="welcome-title">
            <p className="home-eyebrow">{firstName ? `Welcome back, ${firstName}` : p.displayName}</p>
            <h1 id="welcome-title">{b.title ?? p.tagline ?? 'Everything your family needs, in one place.'}</h1>
          </section>
        ) : null,
      )}
      <div className={content.length ? 'home-grid' : 'home-grid home-grid-single'}>
        <div hidden={!content.length}>
          {content.map((b) => (
              <section key={b.id} className="card" aria-label={b.title}>
                <div className="section-title">
                  <h2>{b.title}</h2>
                </div>
              </section>
            ))}
        </div>
        <aside aria-labelledby="office-title">
          <div className="card contact-card">
            <div className="accent-rule" aria-hidden="true" />
            <h2 id="office-title">Need the front office?</h2>
            {p.officeHours && <p>{p.officeHours}</p>}
            {p.phone && (
              <div>
                <p className="label">Call</p>
                <a href={`tel:${p.phone.replace(/[^\d+]/g, '').replace(/^(\d{10})$/, '+1$1')}`}>{p.phone}</a>
              </div>
            )}
            {p.email && (
              <div>
                <p className="label">Email</p>
                <a href={`mailto:${p.email}`}>{p.email}</a>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
