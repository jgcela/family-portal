// "Add to calendar" download for one event (Apple Calendar, Outlook).
import { getPublicEvent } from '@/server/services/calendar';
import { findTenantByKey, isServable } from '@/server/tenancy/tenants';
import { getModuleState } from '@/server/services/modules';
import { buildIcs } from '@/server/calendar/ics-export';

type Ctx = { params: Promise<{ tenant: string; id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { tenant: key, id } = await params;
  const tenant = await findTenantByKey(decodeURIComponent(key));
  if (!tenant || !isServable(tenant)) return new Response('Not found', { status: 404 });
  const modules = await getModuleState(tenant.id);
  if (!modules.active.some((x) => x.id === 'calendar')) return new Response('Not found', { status: 404 });
  const row = await getPublicEvent(tenant.id, id);
  if (!row) return new Response('Not found', { status: 404 });
  const body = buildIcs({ name: tenant.name, domain: new URL(req.url).hostname, events: [{ ...row.e, url: row.e.registrationUrl }] });
  const safe = row.e.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'event';
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safe}.ics"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
