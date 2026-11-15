import { OpsForm } from '../_ops/forms';
import { saveStudentAction } from '../_ops/actions';
import type { Student } from '@/server/db/schema';

export function StudentForm({ tenantKey, student, grades }: { tenantKey: string; student: Student | null; grades: { id: string; name: string }[] }) {
  return (
    <OpsForm action={saveStudentAction.bind(null, tenantKey, student?.id ?? null)} submit={student ? 'Save' : 'Add student'}>
      <div className="form-row">
        <div className="field">
          <label htmlFor="firstName">First name</label>
          <input id="firstName" name="firstName" defaultValue={student?.firstName} required maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="lastName">Last name</label>
          <input id="lastName" name="lastName" defaultValue={student?.lastName} required maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="preferredName">Preferred name</label>
          <input id="preferredName" name="preferredName" defaultValue={student?.preferredName ?? ''} maxLength={80} />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="gradeId">Grade</label>
          <select id="gradeId" name="gradeId" defaultValue={student?.gradeId ?? ''}>
            <option value="">No grade</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="externalId">SIS id (optional)</label>
          <input id="externalId" name="externalId" defaultValue={student?.externalId ?? ''} maxLength={64} />
          <span className="hint">The student&apos;s id in FACTS or your SIS. Used for matching imports.</span>
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={student?.status ?? 'active'}>
            <option value="active">Active</option>
            <option value="inactive">Inactive (left the school)</option>
          </select>
        </div>
      </div>
    </OpsForm>
  );
}
