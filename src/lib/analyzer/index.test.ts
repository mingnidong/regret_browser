import { describe, expect, it } from 'vitest';
import type { AnalyzerContext, PageSnapshot } from '../types';
import { analyzePage, DIMENSION_WEIGHTS, riskLabel } from './index';

function snapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  const paragraphs = overrides.paragraphs ?? [
    'Careful measurements from three independent trials show a modest improvement in battery life.',
    'The report describes the method, sample size, limitations, and the complete numerical results.',
  ];
  const text = overrides.text ?? paragraphs.join(' ');
  return {
    url: 'https://example.com/report',
    domain: 'example.com',
    title: 'Independent battery trial reports modest improvement',
    description: 'Methods and results from an independent battery trial.',
    text,
    headings: [],
    paragraphs,
    wordCount: overrides.wordCount ?? text.split(/\s+/).length,
    linkCount: 0,
    paragraphCount: paragraphs.length,
    readingTimeMinutes: 2,
    extractedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function context(sensitivity: AnalyzerContext['settings']['sensitivity'] = 'medium'): AnalyzerContext {
  return {
    settings: { badgeEnabled: true, sensitivity, hiddenDomains: [] },
    fingerprints: [],
  };
}

describe('analyzePage', () => {
  it('scores explicit clickbait, hype, emotion, and thin content as risky', () => {
    const result = analyzePage(snapshot({
      title: "You Won't Believe This REVOLUTIONARY Secret!",
      description: 'This mind-blowing and terrifying discovery will shock you.',
      text: "In this article, let's dive in. This amazing secret is terrifying.",
      paragraphs: ["In this article, let's dive in. This amazing secret is terrifying."],
      wordCount: 13,
      paragraphCount: 1,
      linkCount: 4,
    }), context());

    expect(result.dimensions.clickbait).toBeGreaterThan(60);
    expect(result.dimensions.informationDensity).toBeGreaterThan(60);
    expect(result.dimensions.emotionalManipulation).toBeGreaterThan(20);
    expect(result.suspiciousPhrases).toContain("you won't believe");
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it('detects repetition and duplicate paragraphs', () => {
    const repeated = 'The same recycled claim appears here without any supporting evidence.';
    const result = analyzePage(snapshot({
      paragraphs: [repeated, repeated, repeated],
      text: `${repeated} ${repeated} ${repeated}`,
      paragraphCount: 3,
      wordCount: 30,
    }), context());

    expect(result.signals.repetition.duplicateParagraphPairs).toBe(3);
    expect(result.signals.repetition.repeatedPhraseRatio).toBeGreaterThan(0);
    expect(result.dimensions.novelty).toBeGreaterThan(50);
  });

  it('uses title fingerprints and negative feedback history', () => {
    const page = snapshot({ title: 'Seven battery tricks every phone owner needs' });
    const result = analyzePage(page, {
      ...context(),
      domainStats: {
        domain: 'example.com',
        worthIt: 0,
        shallow: 4,
        ragebait: 2,
        distracting: 0,
        duplicate: 0,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      fingerprints: [{
        id: 'old',
        url: 'https://other.example/battery',
        domain: 'other.example',
        title: 'Seven battery tricks every phone owner needs now',
        terms: ['battery', 'every', 'needs', 'owner', 'phone', 'seven', 'tricks'],
        feedback: 'shallow',
        sentiment: 'regretted',
        createdAt: '2025-12-01T00:00:00.000Z',
      }],
    });

    expect(result.similarPages).toHaveLength(1);
    expect(result.similarPages[0]?.similarity).toBeGreaterThan(0.8);
    expect(result.dimensions.sourceHistory).toBeGreaterThan(50);
    expect(result.dimensions.novelty).toBeGreaterThan(0);
  });

  it('applies sensitivity after preserving the same base score', () => {
    const page = snapshot({ wordCount: 180 });
    const low = analyzePage(page, context('low'));
    const medium = analyzePage(page, context('medium'));
    const high = analyzePage(page, context('high'));

    expect(low.baseScore).toBe(medium.baseScore);
    expect(high.baseScore).toBe(medium.baseScore);
    expect(low.score).toBeLessThan(medium.score);
    expect(high.score).toBeGreaterThan(medium.score);
  });

  it('keeps all six dimensions and final scores within 0-100', () => {
    const result = analyzePage(snapshot({
      title: '!!! AMAZING AMAZING AMAZING !!!',
      wordCount: 0,
      linkCount: 100,
      paragraphs: [],
      paragraphCount: 0,
      text: '',
    }), context('high'));

    expect(Object.keys(result.dimensions)).toHaveLength(6);
    expect(Object.values(result.dimensions).every((score) => score >= 0 && score <= 100)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('computes the final base score from the documented dimension weights', () => {
    const result = analyzePage(snapshot({ wordCount: 180, linkCount: 12 }), context());
    const weighted = Object.entries(DIMENSION_WEIGHTS).reduce(
      (total, [key, weight]) => total + result.dimensions[key as keyof typeof result.dimensions] * weight,
      0,
    );

    expect(Object.values(DIMENSION_WEIGHTS).reduce((total, weight) => total + weight, 0)).toBeCloseTo(1);
    expect(result.baseScore).toBe(Math.round(weighted));
  });

  it('uses the specified inclusive score bands', () => {
    expect(riskLabel(25)).toBe('Worth it');
    expect(riskLabel(26)).toBe('Mixed');
    expect(riskLabel(50)).toBe('Mixed');
    expect(riskLabel(51)).toBe('Low-signal');
    expect(riskLabel(75)).toBe('Low-signal');
    expect(riskLabel(76)).toBe('High regret risk');
  });
});
