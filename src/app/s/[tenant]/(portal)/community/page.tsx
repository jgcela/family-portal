import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPortalView, getTenantOr404, getViewer, tenantBase } from '@/server/request';
import { countFamilyOnlyCommunity, listPublicCommunity, type CommunityRow } from '@/server/services/community';

export const metadata = { title: 'Community' };

function grouped(items: CommunityRow[]) {
  const groups = new Map<string, CommunityRow[]>();
  for (const i of items) {
    const g = i.groupName ?? 'Other';
    groups.set(g, [...(groups.get(g) ?? []), i]);
  }
  return [...groups];
}

const nameKey = (n: string) =>
  n
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export default async function CommunityPage({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const view = await getPortalView(tenant.id);
  if (!view.activeModules.some((m) => m.id === 'community')) notFound();
  const viewer = await getViewer(tenant.id);
  const [wishlists, favorites, base, hiddenFav, hiddenWish] = await Promise.all([
    listPublicCommunity(tenant.id, 'wishlist', viewer),
    listPublicCommunity(tenant.id, 'favorites', viewer),
    tenantBase(key),
    viewer.kind === 'public' ? countFamilyOnlyCommunity(tenant.id, 'favorites') : Promise.resolve(0),
    viewer.kind === 'public' ? countFamilyOnlyCommunity(tenant.id, 'wishlist') : Promise.resolve(0),
  ]);
  // Link a wishlist to its owner's favorites only when the name points to exactly one card.
  const favByName = new Map<string, string | null>();
  for (const f of favorites) favByName.set(nameKey(f.name), favByName.has(nameKey(f.name)) ? null : f.id);
  const school = view.profile.shortName ?? view.profile.displayName;
  const signIn = `${base}/login?next=${encodeURIComponent(`${base}/community`)}`;
  const showWish = wishlists.length > 0 || hiddenWish > 0;
  const showFav = favorites.length > 0 || hiddenFav > 0;
  return (
    <div className="container content-page">
      <h1>Community</h1>
      {showWish && showFav && (
        <nav aria-label="On this page" className="community-jump">
          <a href="#wishlists">Teacher wishlists</a>
          <a href="#favorites">Staff favorites</a>
        </nav>
      )}
      {!showWish && !showFav && <p className="muted">Nothing here yet.</p>}

      {showWish && (
        <section id="wishlists" className="community-section" aria-labelledby="wishlists-title">
          <h2 id="wishlists-title">Teacher wishlists</h2>
          <p className="muted">Support your child&rsquo;s classroom. Lists ship straight to the school.</p>
          {hiddenWish > 0 && (
            <div className="notice">
              {hiddenWish === 1 ? 'One more list is' : `${hiddenWish} more lists are`} only for {school} families. <Link href={signIn}>Sign in</Link> to see{' '}
              {hiddenWish === 1 ? 'it' : 'them'}.
            </div>
          )}
          {grouped(wishlists).map(([g, list]) => (
            <div key={g} className="vol-group">
              <h3 className="community-group">{g}</h3>
              <div className="vol-grid">
                {list.map((w) => {
                  const fav = favByName.get(nameKey(w.name));
                  return (
                    <article key={w.id} className="vol-card" id={`w-${w.id}`}>
                      <div className="vol-head">
                        <h4 className="community-name">{w.name}</h4>
                        {w.role && <p className="muted">{w.role}</p>}
                      </div>
                      <p className="btn-row">
                        <a className="btn btn-primary btn-sm" href={w.url ?? '#'} target="_blank" rel="noopener">
                          Wishlist<span className="visually-hidden"> for {w.name} (opens in a new tab)</span>
                        </a>
                        {fav && (
                          <a className="btn btn-quiet btn-sm" href={`#f-${fav}`}>
                            Favorite things<span className="visually-hidden"> of {w.name}</span>
                          </a>
                        )}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      {showFav && (
        <section id="favorites" className="community-section" aria-labelledby="favorites-title">
          <h2 id="favorites-title">Staff favorites</h2>
          <p className="muted">What our staff enjoy, for a thank-you note or a small treat.</p>
          {hiddenFav > 0 && (
            <div className="notice">
              Staff favorites are only for {school} families. <Link href={signIn}>Sign in</Link> to see them.
            </div>
          )}
          {grouped(favorites).map(([g, list]) => (
            <div key={g} className="vol-group">
              <h3 className="community-group">{g}</h3>
              <div className="vol-grid">
                {list.map((f) => (
                  <article key={f.id} className="vol-card" id={`f-${f.id}`}>
                    <div className="vol-head">
                      <h4 className="community-name">{f.name}</h4>
                      {f.role && <p className="muted">{f.role}</p>}
                    </div>
                    {f.details.length > 0 ? (
                      <dl className="fav-list">
                        {f.details.map((d) => (
                          <div key={d.label}>
                            <dt>{d.label}</dt>
                            <dd>{d.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="muted">No favorites shared yet.</p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
