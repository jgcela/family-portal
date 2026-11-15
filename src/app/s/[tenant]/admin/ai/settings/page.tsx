import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { can } from '@/server/rbac/authorize';
import { getAiSettings, TOPICS } from '@/server/services/knowledge';
import { AiTabs } from '../tabs';
import { SettingsForm } from '../forms';

export const metadata = { title: 'AI settings' };

export default async function AiSettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { ctx } = await requireStaff(key);
  if (!can(ctx, 'ai.knowledge.manage')) notFound();
  const [base, s] = await Promise.all([tenantBase(key), getAiSettings(ctx)]);
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>AI Control Center</h1>
          <p>Who can ask, who gets the questions the assistant can&apos;t answer, and how long questions are kept.</p>
        </div>
      </div>
      <AiTabs base={base} current="/settings" />
      <section className="panel">
        <div className="panel-body">
          <SettingsForm
            tenantKey={key}
            canEdit={!ctx.support && can(ctx, 'ai.settings.manage')}
            topics={TOPICS}
            defaults={{ familiesEnabled: s.familiesEnabled, publicEnabled: s.publicEnabled, retentionDays: s.retentionDays, storeQuestionText: s.storeQuestionText, contacts: s.escalationContacts }}
          />
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>What the assistant can do</h2>
        </div>
        <div className="panel-body">
          <ul>
            <li>Answer questions using only the sources approved on the Knowledge base tab, with the source shown.</li>
            <li>Read upcoming events from the published calendar, if the calendar source is approved.</li>
            <li>It cannot see students, attendance, grades or any family&apos;s private information, and it can&apos;t change anything.</li>
            <li>The school&apos;s information is sent to the AI provider only to answer the question; it is not used to train models.</li>
          </ul>
        </div>
      </section>
    </>
  );
}
