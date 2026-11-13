import { calculatorLimits } from '@/config/site';

export type SavingsInput = {
  tasksPerWeek: number;
  /** 0–100. Only tasks that need zero staff intervention count. */
  sharePercent: number;
  minutesPerTask: number;
  weeksPerYear: number;
  hourlyCost: number;
};

export type SavingsResult = {
  tasksAvoidedPerWeek: number;
  hoursPerWeek: number;
  hoursPerYear: number;
  value: number;
};

export function calculateSavings(i: SavingsInput): SavingsResult {
  const share = i.sharePercent / 100;
  const tasksAvoidedPerWeek = i.tasksPerWeek * share;
  const hoursPerWeek = (tasksAvoidedPerWeek * i.minutesPerTask) / 60;
  const hoursPerYear = hoursPerWeek * i.weeksPerYear;
  const value = hoursPerYear * i.hourlyCost;
  return { tasksAvoidedPerWeek, hoursPerWeek, hoursPerYear, value };
}

export type FieldKey = keyof SavingsInput;

/** Returns an error message, or null when the value is inside its range. */
export function validateField(key: FieldKey, raw: string): string | null {
  const lim = calculatorLimits[key];
  if (raw.trim() === '') return 'Enter a number.';
  const n = Number(raw);
  if (!Number.isFinite(n)) return 'Enter a number.';
  if (n < lim.min || n > lim.max) return `Use a value from ${lim.min} to ${lim.max}.`;
  return null;
}

/** Rounds to at most one decimal place and drops a trailing .0 */
export function formatHours(n: number): string {
  const r = Math.round(n * 10) / 10;
  return r.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export function formatUSD(n: number, digits = 0): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
