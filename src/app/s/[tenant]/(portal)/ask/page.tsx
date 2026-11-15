import { notFound } from 'next/navigation';
import { getPortalView, getTenantOr404, getViewer, tenantBase } from '@/server/request';
import { assistantAvailableFor } from '@/server/services/assistant';
import { AskForm } from './ask-form';

export const metadata = { title: 'Ask the school' };

export default async function AskPage({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const tenant = await getTenantOr404(key);
  const [view, viewer, base] = await Promise.all([getPortalView(tenant.id), getViewer(tenant.id), tenantBase(key)]);
  if (!(await assistantAvailableFor(tenant.id, viewer, view.activeModules.map((m) => m.id)))) notFound();
  return (
    <div className="container content-page ai-page">
      <h1>Ask the school</h1>
      <p className="section-intro">
        Quick answers from {view.profile.shortName ?? view.profile.displayName}&apos;s handbook, policies, calendar and announcements, with the source for each answer. If the
        answer isn&apos;t in them, it will tell you who to contact instead of guessing.
      </p>
      <AskForm
        tenantKey={key}
        base={base}
        canEscalate={viewer.kind === 'family' && view.activeModules.some((m) => m.id === 'operations_inbox')}
        examples={['What time is drop-off?', 'What is the uniform policy?', 'When is the next day off?']} />
    </div>
  );
}
