import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, tenantBase } from '@/server/request';
import { can } from '@/server/rbac/authorize';
import { TOPICS } from '@/server/services/knowledge';
import { listAudiences } from '@/server/services/calendar';
import { SourceForm } from '../../forms';

export const metadata = { title: 'New source' };

export default async function NewSource({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ kind?: string }> }) {
  const key = (await params).tenant;
  const { ctx, tenant } = await requireStaff(key);
  if (!can(ctx, 'ai.knowledge.manage') || ctx.support) notFound();
  const kind = (await searchParams).kind === 'text' ? 'text' : 'faq';
  const [base, auds] = await Promise.all([tenantBase(key), listAudiences(tenant.id)]);
  return (
    <>
      <div className="admin-head">
        <div>
          <p className="muted">
            <Link href={`${base}/admin/ai`}>AI Control Center</Link>
          </p>
          <h1>{kind === 'faq' ? 'New FAQ answer' : 'Paste text'}</h1>
          <p>
            {kind === 'faq'
              ? 'A question families ask and the answer the school approves. Use it also to correct outdated information: mark it authoritative.'
              : 'Text from anywhere, for example a web page or an email you send every year. HTML is turned into plain text.'}
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-body">
          <SourceForm
            tenantKey={key}
            id={null}
            kind={kind}
            own
            topics={TOPICS}
            audiences={auds.filter((x) => x.kind !== 'staff')}
            defaults={{ title: '', body: '', topic: kind === 'faq' ? 'faq' : 'general', visibility: 'families', audienceIds: [], authoritative: kind === 'faq', effectiveDate: '', reviewBy: '', url: '' }}
          />
        </div>
      </section>
    </>
  );
}
