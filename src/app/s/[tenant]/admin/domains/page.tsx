import { notFound } from 'next/navigation';
import { requireStaff } from '@/server/request';
import { can } from '@/server/rbac/authorize';
import { listDomains, MAX_CUSTOM_DOMAINS, txtRecordName, txtRecordValue } from '@/server/services/domains';
import { addDomainAction, primaryDomainAction, removeDomainAction, verifyDomainAction } from './actions';
import { AddDomainForm, CopyValue, DomainButton } from './forms';

export const metadata = { title: 'Domains' };

/** Where the CNAME should point. Vercel's documented target unless the platform sets another. */
const CNAME_TARGET = process.env.CUSTOM_DOMAIN_CNAME ?? 'cname.vercel-dns.com';

export default async function DomainsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (ctx.support || !can(ctx, 'domains.manage')) notFound();
  const all = await listDomains(tenant.id);
  const custom = all.filter((d) => d.kind === 'custom');
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Domains</h1>
          <p>
            Your portal always works at <code>/s/{tenant.slug}</code> on the platform address. You can also give it your
            own address, such as portal.yourschool.org.
          </p>
        </div>
      </div>
      {custom.map((d) => {
        const sub = d.hostname.split('.').length > 2;
        return (
          <section key={d.id} className="panel" aria-labelledby={`d-${d.id}`}>
            <div className="panel-head">
              <h2 id={`d-${d.id}`}>
                {d.hostname}{' '}
                <span className={`status ${d.verifiedAt ? 'status-published' : 'status-in_review'}`}>{d.verifiedAt ? (d.isPrimary ? 'Verified · main address' : 'Verified') : 'Waiting for DNS'}</span>
              </h2>
            </div>
            <div className="panel-body form">
              {!d.verifiedAt ? (
                <>
                  <p>Whoever manages your school’s domain (often your IT person or web company) adds these two records:</p>
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th scope="col">Type</th>
                          <th scope="col">Name</th>
                          <th scope="col">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>TXT</td>
                          <td>
                            <CopyValue value={txtRecordName(d.hostname)} />
                          </td>
                          <td>
                            <CopyValue value={txtRecordValue(d.verificationToken ?? '')} />
                          </td>
                        </tr>
                        <tr>
                          <td>{sub ? 'CNAME' : 'A'}</td>
                          <td>
                            <CopyValue value={d.hostname} />
                          </td>
                          <td>{sub ? <CopyValue value={CNAME_TARGET} /> : <span className="muted">Ask the platform team; a main domain needs an A record.</span>}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="muted">
                    The TXT record proves the domain is yours. The {sub ? 'CNAME' : 'A'} record sends visitors to the portal.
                    The platform team also has to connect the domain on their side; they see it on their list.
                  </p>
                  <div className="form-actions">
                    <DomainButton run={verifyDomainAction.bind(null, key, d.id)} label="Check DNS now" kind="primary" />
                  </div>
                </>
              ) : (
                <div className="form-actions">
                  {d.isPrimary ? (
                    <DomainButton run={primaryDomainAction.bind(null, key, null)} label="Stop using as main address" />
                  ) : (
                    <DomainButton run={primaryDomainAction.bind(null, key, d.id)} label="Use as main address" />
                  )}
                </div>
              )}
              <div className="form-actions">
                <DomainButton run={removeDomainAction.bind(null, key, d.id)} label="Remove domain" kind="danger" confirm="Confirm remove" />
              </div>
            </div>
          </section>
        );
      })}
      {custom.length < MAX_CUSTOM_DOMAINS && (
        <section className="panel" aria-labelledby="add-title">
          <div className="panel-head">
            <h2 id="add-title">Add a domain</h2>
          </div>
          <div className="panel-body">
            <AddDomainForm run={addDomainAction.bind(null, key)} />
          </div>
        </section>
      )}
    </>
  );
}
