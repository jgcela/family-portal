import { SchoolLoginForm } from './form';

export const metadata = { title: 'School sign in' };

// Linked from the marketing site as "School login". Families are not sent
// here: they use their school's own portal address.
export default function SchoolLogin() {
  return (
    <main id="main" className="container" style={{ paddingBlock: 'var(--space-8)', maxWidth: 460 }}>
      <div className="card" style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <h1 style={{ fontSize: '1.6rem' }}>School sign in</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>
          For school staff. Find your school, then sign in with your staff email and password.
        </p>
        <SchoolLoginForm />
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          Parents: use the portal link your school sent you.
        </p>
      </div>
    </main>
  );
}
