import { notFound } from 'next/navigation';
import { requirePlatformAdmin } from '@/server/request';
import { GRADE_STRUCTURES, listPlans, platformCan } from '@/server/services/platform';
import { MODULES } from '@/server/modules/registry';
import { rootDomain } from '@/server/tenancy/config';
import { NewSchoolWizard } from './wizard';
import { createSchoolAction } from './actions';

export const metadata = { title: 'New school' };

export default async function NewSchoolPage() {
  const { ctx } = await requirePlatformAdmin();
  if (!platformCan(ctx, 'schools.manage')) notFound();
  const plans = await listPlans();
  const root = rootDomain();
  return (
    <>
      <div className="admin-head">
        <div>
          <h1>New school</h1>
          <p>
            Creates the school with its grades, school year, colours and modules, and an invitation for its first
            administrator. The portal stays in “Setting up” until you launch it.
          </p>
        </div>
      </div>
      <NewSchoolWizard
        run={createSchoolAction}
        plans={plans.map((p) => ({ id: p.id, name: p.name, description: p.description, includedModules: p.includedModules }))}
        modules={MODULES.filter((m) => m.implemented && !m.required).map((m) => ({ id: m.id, name: m.name, description: m.description }))}
        structures={Object.entries(GRADE_STRUCTURES).map(([id, s]) => ({ id, label: s.label, grades: s.grades.map((g) => ({ code: g.code, name: g.name })) }))}
        addressPattern={root === 'localhost' ? '/s/' : `.${root}`}
      />
    </>
  );
}
