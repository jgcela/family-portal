import { describe, expect, it } from 'vitest';

import { contrastRatio, ensureContrast, onColor } from '@/theme/contrast';

describe('school colors', () => {
  it('keeps St. Mary navy as is on white (already readable)', () => {
    expect(ensureContrast('#16335B', '#FFFFFF')).toBe('#16335B');
  });

  it('darkens a light school color until text on white reaches 4.5:1', () => {
    const fixed = ensureContrast('#FCBC40', '#FFFFFF');
    expect(contrastRatio(fixed, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('lightens a dark school color on the dark background', () => {
    const fixed = ensureContrast('#16335B', '#000000');
    expect(contrastRatio(fixed, '#000000')).toBeGreaterThanOrEqual(4.5);
  });

  it('picks readable text on a fill', () => {
    expect(onColor('#16335B')).toBe('#FFFFFF');
    expect(onColor('#FCBC40')).toBe('#111418');
  });
});
