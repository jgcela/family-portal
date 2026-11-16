import { describe, expect, it } from 'vitest';

import { dayLabel, schoolDay, time } from '@/lib/dates';

describe('dates', () => {
  it('formats times the American way', () => {
    expect(time(new Date(2026, 10, 16, 8, 45))).toBe('8:45 AM');
    expect(time(new Date(2026, 10, 16, 12, 0))).toBe('12 PM');
  });

  it('labels nearby days in words', () => {
    const now = new Date(2026, 10, 16, 10);
    expect(dayLabel(new Date(2026, 10, 16), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 10, 17), now)).toBe('Tomorrow');
  });

  it('skips weekends for school days', () => {
    for (let i = 0; i < 10; i++) expect([0, 6]).not.toContain(schoolDay(i).getDay());
  });
});
