// The school's own assumptions for the "staff time saved" estimate.
// Kept apart from services/analytics.ts so the module registry can use it.
import { z } from 'zod';

export const assumptionsSchema = z
  .object({
    minutesPerAbsenceCall: z.number().int().min(0).max(60).default(3),
    minutesPerAnsweredQuestion: z.number().int().min(0).max(60).default(4),
    minutesPerAutomatedItem: z.number().int().min(0).max(60).default(2),
    /** 0 = don't show a money figure. */
    hourlyStaffCost: z.number().min(0).max(500).default(0),
  })
  .strict();
export type Assumptions = z.infer<typeof assumptionsSchema>;
