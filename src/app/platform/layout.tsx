import { requirePlatformAdmin } from '@/server/request';
import { PlatformNavLink } from './_components/nav-link';
import '../s/[tenant]/admin/admin.css';

export const metadata = { title: { default: 'Platform', template: '%s · Platform' } };

/** Super Admin shell. Separate from every school's dashboard; platform roles only. */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await requirePlatformAdmin();
  const name = process.env.PLATFORM_NAME ?? 'School Portal';
  return (
    <div className="admin">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="admin-side">
        <div className="admin-school">
          <span className="admin-school-mark" aria-hidden="true">
            P
          </span>
          <div>
            <div className="admin-school-name">{name}</div>
            <div className="muted" style={{ fontSize: '0.8rem' }}>
              {user.name} · {role}
            </div>
          </div>
        </div>
        <nav className="admin-nav" aria-label="Platform administration">
          <div>
            <h2>Schools</h2>
            <ul>
              <li>
                <PlatformNavLink href="/platform" exact>
                  All schools
                </PlatformNavLink>
              </li>
              {role !== 'support' && (
                <li>
                  <PlatformNavLink href="/platform/schools/new">New school</PlatformNavLink>
                </li>
              )}
            </ul>
          </div>
          <div>
            <h2>Platform</h2>
            <ul>
              <li>
                <PlatformNavLink href="/platform/health">System health</PlatformNavLink>
              </li>
              <li>
                <PlatformNavLink href="/platform/plans">Plans &amp; modules</PlatformNavLink>
              </li>
              <li>
                <PlatformNavLink href="/platform/team">Platform team</PlatformNavLink>
              </li>
              <li>
                <PlatformNavLink href="/platform/activity">Activity log</PlatformNavLink>
              </li>
            </ul>
          </div>
        </nav>
      </aside>
      <main id="main" className="admin-main">
        {children}
      </main>
    </div>
  );
}
