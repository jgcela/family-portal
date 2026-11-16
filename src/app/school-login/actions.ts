'use server';
import { redirect } from 'next/navigation';
import { allowAttempt, clientIp, TOO_MANY } from '@/server/security/attempts';
import { adminPath, findSchool, parseSchoolQuery } from '@/server/tenancy/find-school';

export type FindState = { error?: string; value?: string } | undefined;

const NOT_FOUND =
  'We could not find that school. Check the spelling, or use the school code: it is the short name in your portal address, after /s/ (for example, stmary).';

export async function goToSchool(_prev: FindState, fd: FormData): Promise<FindState> {
  const value = String(fd.get('school') ?? '').slice(0, 200);
  if (!(await allowAttempt(`school-login:${await clientIp()}`, 20, 15 * 60))) return { error: TOO_MANY, value };
  const q = parseSchoolQuery(value);
  if (!q) return { error: 'Enter your school code, portal address or school name.', value };
  const r = await findSchool(q);
  if (r.kind !== 'found') return { error: NOT_FOUND, value };
  redirect(adminPath(r.tenant));
}
