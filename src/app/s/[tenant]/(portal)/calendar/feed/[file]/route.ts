// Public ICS subscription feed: /calendar/feed/<calendar-key>.ics
// Only published events of calendars marked public are included.
import { getPublicFeed } from '@/server/services/calendar';
import { findTenantByKey, isServable } from '@/server/tenancy/tenants';
import { getModuleState } from '@/server/services/modules';
import { buildIcs } from '@/server/calendar/ics-export';

type Ctx = { params: Promise<{ tenant: string; file: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { tenant: key, file } = await params;
  const m = /^([a-z0-9][a-z0-9-]{0,39})\.ics$/.exec(file);
  const tenant = m ? await findTenantByKey(decodeURIComponent(key)) : null;
  if (!m || !tenant || !isServable(tenant)) return new Response('Not found', { status: 404 });
  const modules = await getModuleState(tenant.id);
  if (!modules.active.some((x) => x.id === 'calendar')) return new Response('Not found', { status: 404 });

  const url = new URL(req.url);
  if (url.searchParams.has('google')) {
    // Google subscribes by URL; it needs the absolute webcal address.
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
    const feed = `webcal://${host}${url.pathname}`;
    return Response.redirect(`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feed)}`, 302);
  }
  const data = await getPublicFeed(tenant.id, m[1]!);
  if (!data) return new Response('Not found', { status: 404 });
  const body = buildIcs({
    name: `${tenant.name} · ${data.calendar.name}`,
    domain: url.hostname,
    events: data.events.map((e) => ({ ...e, url: e.registrationUrl })),
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${m[1]}.ics"`,
      'Cache-Control': 'public, max-age=900',
    },
  });
}
