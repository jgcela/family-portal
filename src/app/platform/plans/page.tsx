import { requirePlatformAdmin } from '@/server/request';
import { listPlans } from '@/server/services/platform';
import { MODULES } from '@/server/modules/registry';
import { formatBytes } from '../_components/format';
import { catalogPlan } from '@/server/billing/catalog';

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US')}`;

export const metadata = { title: 'Plans & modules' };

export default async function PlansPage() {
  await requirePlatformAdmin();
  const plans = await listPlans();
  const mods = MODULES.filter((m) => !m.required);
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Plans &amp; modules</h1>
          <p>
            Names, prices and features come from the marketing site (<code>marketing/src/config/site.ts</code>) and are
            synced on each production deploy. A school can also get extra modules from its own page. No payment is
            processed here.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Module</th>
                <th scope="col">Available</th>
                {plans.map((p) => (
                  <th scope="col" key={p.id}>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Price per year</th>
                <td />
                {plans.map((p) => (
                  <td key={p.id}>{p.priceCentsPerYear != null ? `${catalogPlan(p.id)?.priceIsFrom ? 'From ' : ''}${usd(p.priceCentsPerYear)}` : '—'}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Implementation (once)</th>
                <td />
                {plans.map((p) => {
                  const c = catalogPlan(p.id);
                  return <td key={p.id}>{c ? usd(c.implementationCents) : '—'}</td>;
                })}
              </tr>
              <tr>
                <th scope="row">Storage</th>
                <td />
                {plans.map((p) => (
                  <td key={p.id}>{formatBytes(p.storageLimitMb * 1024 * 1024)}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Staff accounts</th>
                <td />
                {plans.map((p) => (
                  <td key={p.id}>{p.staffUserLimit ?? 'Unlimited'}</td>
                ))}
              </tr>
              {mods.map((m) => (
                <tr key={m.id}>
                  <th scope="row">
                    {m.name}
                    <div className="muted" style={{ fontSize: '0.8rem', fontWeight: 400 }}>
                      {m.description}
                    </div>
                  </th>
                  <td>{m.implemented ? <span className="yes">Ready</span> : <span className="muted">Not built yet</span>}</td>
                  {plans.map((p) => (
                    <td key={p.id}>{p.includedModules.includes(m.id) ? <span className="yes">Included</span> : <span className="no">—</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
