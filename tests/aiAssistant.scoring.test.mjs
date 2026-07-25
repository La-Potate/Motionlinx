import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const scoring = require('../src/services/aiAssistant/scoring');

describe('AI Assistant scoring', () => {
  it('weightedScore redistributes weight across present sub-factors', () => {
    const { score } = scoring.weightedScore([
      { key: 'a', weight: 0.5, value: 0.8 },
      { key: 'b', weight: 0.5, value: null },
    ]);
    // With b missing, a alone contributes — should be 80.
    expect(score).toBe(80);
  });

  it('computeTechnical returns a 0-100 integer', () => {
    const card = scoring.computeTechnical({
      indexability: 0.9,
      onPage: 0.7,
      lighthouse: { performance: 0.8, seo: 0.95, accessibility: 0.85 },
      statusHealth: 0.95,
    });
    expect(card.score).toBeGreaterThanOrEqual(0);
    expect(card.score).toBeLessThanOrEqual(100);
    expect(Number.isInteger(card.score)).toBe(true);
    expect(card.breakdown.length).toBe(6);
  });

  it('computeOverall weights technical=0.40, content=0.30, geo=0.30', () => {
    expect(scoring.computeOverall({ technical: 100, content: 0, geo: 0 })).toBe(40);
    expect(scoring.computeOverall({ technical: 0, content: 100, geo: 0 })).toBe(30);
    expect(scoring.computeOverall({ technical: 0, content: 0, geo: 100 })).toBe(30);
    expect(scoring.computeOverall({ technical: 100, content: 100, geo: 100 })).toBe(100);
  });

  it('computeOverall handles missing categories', () => {
    // Only technical present — its weight rises to 1.0.
    expect(scoring.computeOverall({ technical: 80 })).toBe(80);
  });

  it('clamps inputs to [0, 1]', () => {
    const { score } = scoring.weightedScore([
      { key: 'a', weight: 1, value: 1.5 },
    ]);
    // 1.5 is not a valid input but should produce a finite score.
    expect(Number.isFinite(score)).toBe(true);
  });
});
