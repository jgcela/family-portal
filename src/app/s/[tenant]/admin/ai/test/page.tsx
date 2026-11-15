import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { can } from '@/server/rbac/authorize';
import { getJoinPageInfo } from '@/server/services/families';
import { getAiProvider } from '@/server/ai/provider';
import { AiTabs } from '../tabs';
import { SandboxForm } from '../forms';

export const metadata = { title: 'Test the assistant' };

export default async function AiTest({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { ctx, tenant } = await requireStaff(key);
  if (!can(ctx, 'ai.knowledge.manage')) notFound();
  const [base, info] = await Promise.all([tenantBase(key), getJoinPageInfo(tenant.id)]);
  const aiOn = !!getAiProvider();
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>AI Control Center</h1>
          <p>Ask what families would ask, as a visitor, as a family in some grades, or as staff. Families don&apos;t see these tests.</p>
        </div>
      </div>
      <AiTabs base={base} current="/test" />
      {!aiOn && (
        <div className="notice">
          AI answers are not connected yet (no API key on the server). The test shows which approved sources match each question, which is what families would see too.
        </div>
      )}
      <SandboxForm tenantKey={key} base={base} grades={info.grades} />
    </>
  );
}
