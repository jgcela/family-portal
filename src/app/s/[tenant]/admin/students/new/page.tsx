import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc } from 'drizzle-orm';
import { requireStaff, tenantBase } from '@/server/request';
import { can } from '@/server/rbac/authorize';
import { withTenant } from '@/server/db/client';
import { grades } from '@/server/db/schema';
import { StudentForm } from '../shared';

export const metadata = { title: 'Add student' };

export default async function NewStudentPage({ params }: { params: Promise<{ tenant: string }> }) {
  const key = (await params).tenant;
  const { tenant, ctx } = await requireStaff(key);
  if (!can(ctx, 'students.manage') || ctx.support) notFound();
  const a = `${await tenantBase(key)}/admin`;
  const gradeRows = await withTenant(tenant.id, (tx) => tx.select({ id: grades.id, name: grades.name }).from(grades).orderBy(asc(grades.sortOrder)));
  return (
    <>
      <p>
        <Link href={`${a}/students`}>← Students</Link>
      </p>
      <div className="admin-head">
        <h1>Add student</h1>
      </div>
      <section className="panel">
        <div className="panel-body">
          <StudentForm tenantKey={key} student={null} grades={gradeRows} />
        </div>
      </section>
    </>
  );
}
