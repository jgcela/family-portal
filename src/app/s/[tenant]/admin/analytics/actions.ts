'use server';
import { revalidatePath } from 'next/cache';
import { requireStaff, tenantBase } from '@/server/request';
import { updateAssumptions } from '@/server/services/analytics';
import { errorMessage, str } from '../_components/action-helpers';
import type { OpsResult } from '../_ops/actions';

const n = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v === '' ? undefined : Number(v);
};

export async function assumptionsAction(tenantKey: string, _p: OpsResult, fd: FormData): Promise<OpsResult> {
  const { ctx } = await requireStaff(tenantKey);
  try {
    await updateAssumptions(ctx, {
      minutesPerAbsenceCall: n(fd, 'minutesPerAbsenceCall'),
      minutesPerAnsweredQuestion: n(fd, 'minutesPerAnsweredQuestion'),
      minutesPerAutomatedItem: n(fd, 'minutesPerAutomatedItem'),
      hourlyStaffCost: n(fd, 'hourlyStaffCost'),
    });
    revalidatePath(`${await tenantBase(tenantKey)}/admin/analytics`);
    return { ok: 'Saved. The estimate uses your numbers now.' };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}
