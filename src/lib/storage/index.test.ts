import { describe, expect, it } from 'vitest';
import type { AnalysisReport } from '../types';
import {
  addFeedback,
  cacheReport,
  createDefaultState,
  createExportPayload,
  hideDomain,
  importExportPayload,
  parseExportPayload,
  savePage,
} from './index';

function report(): AnalysisReport {
  return {
    id: 'report-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    hidden: false,
    snapshot: {
      url: 'https://www.example.com/story',
      domain: 'www.example.com',
      title: 'An evidence based story',
      description: '',
      text: 'Evidence based story content.',
      headings: [],
      paragraphs: ['Evidence based story content.'],
      wordCount: 4,
      linkCount: 0,
      paragraphCount: 1,
      readingTimeMinutes: 1,
      extractedAt: '2026-01-01T00:00:00.000Z',
    },
    result: {
      score: 10,
      baseScore: 10,
      label: 'Worth it',
      dimensions: {
        clickbait: 0,
        informationDensity: 20,
        novelty: 0,
        emotionalManipulation: 0,
        distractionRisk: 0,
        sourceHistory: 0,
      },
      reasons: ['Clear title', 'Low distraction', 'No repetition'],
      suspiciousPhrases: [],
      signals: {
        clickbaitMatches: [],
        emotionalMatches: [],
        hypeMatches: [],
        listicleMatches: [],
        titleContentOverlap: 1,
        linksPerHundredWords: 0,
        averageParagraphWords: 4,
        repetition: {
          duplicateParagraphPairs: 0,
          repeatedPhraseRatio: 0,
          repeatedPhrases: [],
        },
      },
      similarPages: [],
    },
  };
}

describe('storage pure operations', () => {
  it('normalizes and deduplicates hidden domains', () => {
    const first = hideDomain(createDefaultState(), 'WWW.Example.com');
    const second = hideDomain(first, 'example.com');

    expect(second.settings.hiddenDomains).toEqual(['example.com']);
    expect(createDefaultState().settings.hiddenDomains).toEqual([]);
  });

  it('rejects invalid imports and preserves report cache during valid import', () => {
    expect(() => parseExportPayload({ product: 'other', version: 1, data: {} })).toThrow(
      'Invalid Regret Browser export',
    );

    const cached = cacheReport(createDefaultState(), report());
    const importedState = hideDomain(createDefaultState(), 'news.example');
    const payload = createExportPayload(importedState, '2026-02-01T00:00:00.000Z');
    const merged = importExportPayload(cached, payload);

    expect(merged.settings.hiddenDomains).toEqual(['news.example']);
    expect(merged.reports['report-1']).toBeDefined();
    expect(merged.latestReportId).toBe('report-1');
  });

  it('rejects a malformed nested record instead of silently dropping it', () => {
    const payload = createExportPayload(createDefaultState(), '2026-02-01T00:00:00.000Z');
    const malformed = {
      ...payload,
      data: {
        ...payload.data,
        feedback: [{ id: 'bad', url: 'javascript:alert(1)', kind: 'shallow' }],
      },
    };

    expect(() => parseExportPayload(malformed)).toThrow('Invalid Regret Browser export');
  });

  it('updates feedback, fingerprints, and domain history once per report', () => {
    const cached = cacheReport(createDefaultState(), report());
    const updated = addFeedback(
      cached,
      'report-1',
      'shallow',
      '2026-01-02T00:00:00.000Z',
    );
    const duplicate = addFeedback(
      updated,
      'report-1',
      'ragebait',
      '2026-01-03T00:00:00.000Z',
    );

    expect(updated.feedback).toHaveLength(1);
    expect(updated.feedback[0]?.id).toBe('report-1');
    expect(updated.fingerprints[0]?.sentiment).toBe('regretted');
    expect(updated.domainStats['example.com']?.shallow).toBe(1);
    expect(duplicate).toBe(updated);
    expect(duplicate.domainStats['example.com']?.ragebait).toBe(0);
    expect(cached.feedback).toHaveLength(0);
  });

  it('saves a cached page once per URL', () => {
    const cached = cacheReport(createDefaultState(), report());
    const once = savePage(cached, 'report-1', '2026-01-02T00:00:00.000Z');
    const twice = savePage(once, 'report-1', '2026-01-03T00:00:00.000Z');

    expect(twice.savedPages).toHaveLength(1);
    expect(twice.savedPages[0]?.savedAt).toBe('2026-01-03T00:00:00.000Z');
  });
});
