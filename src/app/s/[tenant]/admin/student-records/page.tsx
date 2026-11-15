import { notFound } from 'next/navigation';
import { requireStaff } from '@/server/request';
import { can } from '@/server/rbac/authorize';
import { getDirectorySettings } from '@/server/services/directory';
import { CAPABILITIES } from '@/server/sis/connector';
import { OpsForm } from '../_ops/forms';
import { addBlockAction, personLinkAction, removeBlockAction, saveSourceAction, testConnectionAction } from './actions';

export const metadata = { title: 'Student records' };
export const dynamic = 'force-dynamic';

const STATUS = { not_configured: 'Not tested yet', connected: 'Connected', error: 'Not working' } as const;
const PRODUCTS = { powerschool: 'PowerSchool', infinite_campus: 'Infinite Campus', skyward: 'Skyward', other: 'Another system with OneRoster' } as const;
/** What the person id and student id are called in each SIS. */
const IDS = { facts: { person: 'FACTS person ID', student: 'FACTS student ID' }, oneroster: { person: 'OneRoster parent ID (sourcedId)', student: 'OneRoster student ID (sourcedId)' } } as const;

export default async function StudentRecordsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (ctx.support || !can(ctx, 'integrations.manage')) notFound();
  const s = await getDirectorySettings(ctx);
  const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: tenant.timezone });
  const sis = s.source === 'facts' || s.source === 'oneroster';
  const prov = s.providers[s.provider];
  const ids = IDS[s.provider];
  const or = s.oneroster;
  const configured = s.provider === 'facts' ? s.hasKey : s.hasSecret;
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Student records</h1>
          <p>
            Where each family&apos;s children come from. Families only see, and only send absence notices for, the children this source gives them. The portal
            connects with credentials the school creates for it and never asks families for their SIS password.
          </p>
        </div>
      </div>

      <section className="panel" aria-labelledby="src-title">
        <div className="panel-head">
          <h2 id="src-title">Source</h2>
        </div>
        <div className="panel-body">
          <OpsForm action={saveSourceAction.bind(null, key)} submit="Save">
            <fieldset className="field">
              <legend>Families&apos; children come from</legend>
              <div>
                <label className="check">
                  <input type="radio" name="source" value="facts" defaultChecked={s.source === 'facts'} /> FACTS (read live each time; the portal keeps no student list)
                </label>
              </div>
              <div>
                <label className="check">
                  <input type="radio" name="source" value="oneroster" defaultChecked={s.source === 'oneroster'} /> PowerSchool, Infinite Campus, Skyward or another
                  system with a OneRoster API (read live each time)
                </label>
              </div>
              <div>
                <label className="check">
                  <input type="radio" name="source" value="manual" defaultChecked={s.source === 'manual'} /> A list the school keeps in the portal (Students page, CSV import)
                </label>
              </div>
              <div>
                <label className="check">
                  <input type="radio" name="source" value="none" defaultChecked={s.source === 'none'} /> Nowhere yet (absence notices are not available)
                </label>
              </div>
            </fieldset>
            <h3 className="form-subhead">FACTS</h3>
            <div className="field">
              <label htmlFor="factsApiKey">FACTS API key</label>
              <input id="factsApiKey" name="factsApiKey" type="password" autoComplete="off" placeholder={s.hasKey ? `Saved, ends in ${s.keyHint ?? '••••'}. Leave empty to keep it.` : 'Paste the key from FACTS'} />
              <span className="hint">
                In FACTS: System → Configuration → API Configuration. Create a key with read access to <strong>People</strong> only. It is stored encrypted and is never shown again.
              </span>
            </div>
            <h3 className="form-subhead">OneRoster (PowerSchool, Infinite Campus, Skyward…)</h3>
            <p className="hint">
              Your SIS administrator creates an OAuth 2.0 client for the portal with read-only rostering access, including parents/contacts. Leave these empty if you
              use FACTS.
            </p>
            <div className="field">
              <label htmlFor="or-product">System</label>
              <select id="or-product" name="orProduct" defaultValue={or?.product ?? 'powerschool'}>
                {Object.entries(PRODUCTS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="field">
              <legend>OneRoster version</legend>
              <div>
                <label className="check">
                  <input type="radio" name="orVersion" value="v1p1" defaultChecked={(or?.version ?? 'v1p1') === 'v1p1'} /> 1.1
                </label>{' '}
                <label className="check">
                  <input type="radio" name="orVersion" value="v1p2" defaultChecked={or?.version === 'v1p2'} /> 1.2
                </label>
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="or-base">API address</label>
              <input id="or-base" name="orBaseUrl" type="url" inputMode="url" defaultValue={or?.baseUrl ?? ''} placeholder="https://sis.yourdistrict.org/api" />
              <span className="hint">The address before /ims/oneroster. The full OneRoster address also works.</span>
            </div>
            <div className="field">
              <label htmlFor="or-token">Token address</label>
              <input id="or-token" name="orTokenUrl" type="url" inputMode="url" defaultValue={or?.tokenUrl ?? ''} placeholder="https://sis.yourdistrict.org/oauth/token" />
            </div>
            <div className="field">
              <label htmlFor="or-client">Client ID</label>
              <input id="or-client" name="orClientId" autoComplete="off" defaultValue={or?.clientId ?? ''} />
            </div>
            <div className="field">
              <label htmlFor="or-secret">Client secret</label>
              <input
                id="or-secret"
                name="orClientSecret"
                type="password"
                autoComplete="off"
                placeholder={s.hasSecret ? `Saved, ends in ${s.secretHint ?? '••••'}. Leave empty to keep it.` : 'Paste the secret'}
              />
              <span className="hint">Stored encrypted and never shown again.</span>
            </div>
          </OpsForm>
        </div>
      </section>

      {configured && (
        <section className="panel" aria-labelledby="conn-title">
          <div className="panel-head">
            <h2 id="conn-title">
              {prov.name} connection <span className={`status ${s.status === 'connected' ? 'status-published' : s.status === 'error' ? 'status-archived' : 'status-in_review'}`}>{STATUS[s.status]}</span>
            </h2>
          </div>
          <div className="panel-body">
            {s.provider === 'facts' && !s.platformReady && (
              <p className="notice">
                The platform team still has to add the FACTS partner key. Until then the test will say the connection is not set up. This does not depend on your school.
              </p>
            )}
            {s.checkedAt && (
              <p className="muted">
                Last checked {fmt.format(s.checkedAt)}
                {s.lastError ? `: ${s.lastError}` : '.'}
              </p>
            )}
            <OpsForm action={testConnectionAction.bind(null, key)} submit="Test the connection">
              <p className="hint">Makes a read-only request to {prov.name} with the saved credentials.</p>
            </OpsForm>
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="cap-title">
        <div className="panel-head">
          <h2 id="cap-title">What the {prov.name} connection can do</h2>
        </div>
        <div className="panel-body">
          <p className="form-intro">
            Works with: {prov.systems}. {prov.verified ? '' : 'Built from the published API; not yet checked against a live school account.'}
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {CAPABILITIES.map((c) => (
                  <tr key={c.id}>
                    <td>{c.label}</td>
                    <td>{prov.capabilities[c.id] === 'available' ? 'Available' : 'Not available'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {sis && (
        <>
          <section className="panel" aria-labelledby="match-title">
            <div className="panel-head">
              <h2 id="match-title">Matching families to {prov.name}</h2>
            </div>
            <div className="panel-body">
              <p className="form-intro">
                When a family opens &ldquo;Report an absence&rdquo;, the portal looks for a parent in {prov.name} with the same email as their portal account. Only
                an exact, single match counts. If a parent uses a different email there, enter their {ids.person} here.
              </p>
              <OpsForm action={personLinkAction.bind(null, key)} submit="Save link" resetOnOk>
                <div className="field">
                  <label htmlFor="pl-member">Family account</label>
                  <select id="pl-member" name="membershipId" required defaultValue="">
                    <option value="">Choose…</option>
                    {s.families.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.email}){f.personId ? ` · ${f.personId}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="pl-person">{ids.person}</label>
                  <input id="pl-person" name="personId" maxLength={100} autoComplete="off" />
                  <span className="hint">Leave empty to remove a link and go back to matching by email.</span>
                </div>
              </OpsForm>
            </div>
          </section>

          <section className="panel" aria-labelledby="block-title">
            <div className="panel-head">
              <h2 id="block-title">Access blocks</h2>
            </div>
            <div className="panel-body">
              <p className="form-intro">
                If {prov.name} links a parent to a child who must not be contacted through this account (for example, a custody order), block it here. The
                block applies even if {prov.name} still lists them together. The note is only visible on this page.
              </p>
              {s.blocks.length > 0 && (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th scope="col">Family account</th>
                        <th scope="col">Student ID</th>
                        <th scope="col">Note</th>
                        <th scope="col">
                          <span className="visually-hidden">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.blocks.map((b) => (
                        <tr key={`${b.membershipId}:${b.studentKey}`}>
                          <td>
                            {b.name} ({b.email})
                          </td>
                          <td>{b.studentKey.replace(/^[a-z]+:/, '')}</td>
                          <td>{b.note}</td>
                          <td>
                            <OpsForm action={removeBlockAction.bind(null, key, b.membershipId, b.studentKey)} submit="Remove" className="">
                              {null}
                            </OpsForm>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <OpsForm action={addBlockAction.bind(null, key)} submit="Block" resetOnOk>
                <div className="field">
                  <label htmlFor="bl-member">Family account</label>
                  <select id="bl-member" name="membershipId" required defaultValue="">
                    <option value="">Choose…</option>
                    {s.families.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="bl-student">{ids.student}</label>
                  <input id="bl-student" name="studentId" required maxLength={100} autoComplete="off" />
                </div>
                <div className="field">
                  <label htmlFor="bl-note">Note (staff only)</label>
                  <input id="bl-note" name="note" required maxLength={500} placeholder="Court order on file, 2026-10-01" />
                </div>
              </OpsForm>
            </div>
          </section>
        </>
      )}
    </>
  );
}
