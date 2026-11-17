import { describe, expect, it } from 'vitest';

import { answerQuestion } from '@/services/assistant';

describe('prototype assistant', () => {
  it('answers with sources when it has verified information', () => {
    const a = answerQuestion("What time is Carmen's field trip?");
    expect(a.status).toBe('verified');
    expect(a.sources.length).toBeGreaterThan(0);
  });

  it('says so when it has no verified answer, with no invented sources', () => {
    const a = answerQuestion('What is the principal’s favorite color?');
    expect(a.status).toBe('not_found');
    expect(a.sources).toEqual([]);
  });

  it('does not answer for a school without the assistant', () => {
    const a = answerQuestion('When is Lucas’s concert at Oak Hill?');
    expect(a.status).toBe('not_found');
  });

  it('never sends an absence by itself: it only prepares a pending draft', () => {
    const a = answerQuestion('Javier is sick tomorrow');
    expect(a.draft?.state).toBe('pending');
    expect(a.draft?.childId).toBe('javier');
  });

  it('does not show grades or homework', () => {
    expect(answerQuestion('Does Javier have homework tonight?').status).toBe('not_found');
  });
});
