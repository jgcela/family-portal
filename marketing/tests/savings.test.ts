import { describe, expect, it } from 'vitest';
import { calculateSavings, validateField, formatUSD, formatHours } from '@/lib/savings';
import { calculatorDefaults } from '@/config/site';

describe('Potential Savings Calculator', () => {
  it('defaults produce 5 hours a week, 180 hours and $5,040 a year', () => {
    const r = calculateSavings({ ...calculatorDefaults });
    expect(r.hoursPerWeek).toBe(5);
    expect(r.hoursPerYear).toBe(180);
    expect(formatUSD(r.value)).toBe('$5,040');
  });

  it('50% fully handled halves the result: 90 hours and $2,520', () => {
    const r = calculateSavings({ ...calculatorDefaults, sharePercent: 50 });
    expect(formatHours(r.hoursPerYear)).toBe('90');
    expect(formatUSD(r.value)).toBe('$2,520');
  });

  it('rejects values outside the allowed range', () => {
    expect(validateField('sharePercent', '120')).toMatch(/0 to 100/);
    expect(validateField('weeksPerYear', '0')).toMatch(/1 to 52/);
    expect(validateField('tasksPerWeek', '')).toBe('Enter a number.');
    expect(validateField('hourlyCost', '28')).toBeNull();
  });
});
