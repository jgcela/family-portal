import { notFound } from 'next/navigation';
import { requireStaff } from '@/server/request';
import { can } from '@/server/rbac/authorize';
import { getDirectorySettings } from '@/server/services/directory';
import { OpsForm } from '../_ops/forms';
import { addBlockAction, personLinkAction, removeBlockAction, saveSourceAction, testConnectionAction } from './actions';

export const metadata = { title: 'Student records' };
export const dynamic = 'force-dynamic';

const STATUS = { not_configured: 'Not tested yet', connected: 'Connected', error: 'Not working' } as const;

export default async function StudentRecordsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (ctx.support || !can(ctx, 'integrations.manage')) notFound();
  const s = await getDirectorySettings(ctx);
  const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: tenant.timezone });
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Student records</h1>
          <p>
            Where each family&apos;s children come from. Families only see, and only send absence notices for, the children this source gives them. The portal
            never asks families for their FACTS password.
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
                  <input type="radio" name="source" value="manual" defaultChecked={s.source === 'manual'} /> A list the school keeps in the portal (Students page, CSV import)
                </label>
              </div>
              <div>
                <label className="check">
                  <input type="radio" name="source" value="none" defaultChecked={s.source === 'none'} /> Nowhere yet (absence notices are not available)
                </label>
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="factsApiKey">FACTS API key</label>
              <input id="factsApiKey" name="factsApiKey" type="password" autoComplete="off" placeholder={s.hasKey ? `Saved, ends in ${s.keyHint ?? '••••'}. Leave empty to keep it.` : 'Paste the key from FACTS'} />
              <span className="hint">
                In FACTS: System → Configuration → API Configuration. Create a key with read access to <strong>People</strong> only. It is stored encrypted and is never shown again.
              </span>
            </div>
          </OpsForm>
        </div>
      </section>

      {s.hasKey && (
        <section className="panel" aria-labelledby="conn-title">
          <div className="panel-head">
            <h2 id="conn-title">
              FACTS connection <span className={`status ${s.status === 'connected' ? 'status-published' : s.status === 'error' ? 'status-archived' : 'status-in_review'}`}>{STATUS[s.status]}</span>
            </h2>
          </div>
          <div className="panel-body">
            {!s.platformReady && (
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
              <p className="hint">Makes one read-only request to FACTS with the saved key.</p>
            </OpsForm>
          </div>
        </section>
      )}

      {s.source === 'facts' && (
        <>
          <section className="panel" aria-labelledby="match-title">
            <div className="panel-head">
              <h2 id="match-title">Matching families to FACTS</h2>
            </div>
            <div className="panel-body">
              <p className="form-intro">
                When a family opens &ldquo;Report an absence&rdquo;, the portal looks for a FACTS parent with the same email as their portal account. Only an exact,
                single match counts. If a parent uses a different email in FACTS, enter their FACTS person ID here.
              </p>
              <OpsForm action={personLinkAction.bind(null, key)} submit="Save link" resetOnOk>
                <div className="field">
                  <label htmlFor="pl-member">Family account</label>
                  <select id="pl-member" name="membershipId" required defaultValue="">
                    <option value="">Choose…</option>
                    {s.families.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.email}){f.personId ? ` · FACTS ${f.personId}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="pl-person">FACTS person ID</label>
                  <input id="pl-person" name="personId" maxLength={64} inputMode="numeric" />
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
                If FACTS links a parent to a child who must not be contacted through this account (for example, a custody order), block it here. The block
                applies even if FACTS still lists them together. The note is only visible on this page.
              </p>
              {s.blocks.length > 0 && (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th scope="col">Family account</th>
                        <th scope="col">FACTS student ID</th>
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
                          <td>{b.studentKey.replace(/^facts:/, '')}</td>
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
                  <label htmlFor="bl-student">FACTS student ID</label>
                  <input id="bl-student" name="factsStudentId" required maxLength={64} />
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
