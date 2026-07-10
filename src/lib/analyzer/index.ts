import type {
  AnalyzerContext,
  DimensionScores,
  ExtractedSignals,
  PageSnapshot,
  RiskLabel,
  ScoreResult,
  Sensitivity,
} from '../types';
import {
  CLICKBAIT_PHRASES,
  EMOTIONAL_PHRASES,
  HYPE_PHRASES,
  LISTICLE_PHRASES,
  SEO_FILLER_PHRASES,
  findPhrases,
  meaningfulTerms,
  repetitionEvidence,
  similarFingerprintPages,
  titleContentOverlap,
  words,
} from '../text';

const DIMENSION_WEIGHTS: Readonly<Record<keyof DimensionScores, number>> = {
  clickbait: 0.2,
  informationDensity: 0.22,
  novelty: 0.16,
  emotionalManipulation: 0.15,
  distractionRisk: 0.15,
  sourceHistory: 0.12,
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function countAllCapsWords(value: string): number {
  return value.split(/\s+/).filter((term) => term.length >= 3 && /[A-Z]/.test(term) && term === term.toUpperCase()).length;
}

function contentLengthRisk(wordCount: number): number {
  if (wordCount < 100) return 70;
  if (wordCount < 250) return 45;
  if (wordCount < 500) return 20;
  return 0;
}

function paragraphLengthRisk(averageParagraphWords: number): number {
  if (averageParagraphWords < 8) return 18;
  if (averageParagraphWords > 140) return 12;
  return 0;
}

function extractSignals(snapshot: PageSnapshot): ExtractedSignals {
  const titleAndDescription = `${snapshot.title} ${snapshot.description}`;
  const allText = `${titleAndDescription} ${snapshot.text}`;
  const repetition = repetitionEvidence(snapshot.paragraphs);
  const paragraphWords = snapshot.paragraphs.reduce((sum, paragraph) => sum + words(paragraph).length, 0);

  return {
    clickbaitMatches: findPhrases(titleAndDescription, CLICKBAIT_PHRASES),
    emotionalMatches: findPhrases(allText, EMOTIONAL_PHRASES),
    hypeMatches: findPhrases(allText, HYPE_PHRASES),
    listicleMatches: unique([
      ...findPhrases(titleAndDescription, LISTICLE_PHRASES),
      ...findPhrases(allText, SEO_FILLER_PHRASES),
    ]),
    titleContentOverlap: titleContentOverlap(snapshot.title, snapshot.text),
    linksPerHundredWords: snapshot.wordCount > 0 ? (snapshot.linkCount / snapshot.wordCount) * 100 : snapshot.linkCount * 100,
    averageParagraphWords: snapshot.paragraphCount > 0 ? paragraphWords / snapshot.paragraphCount : 0,
    repetition,
  };
}

function scoreDimensions(snapshot: PageSnapshot, context: AnalyzerContext, signals: ExtractedSignals): DimensionScores {
  const titleWords = meaningfulTerms(snapshot.title).length;
  const punctuationHype = (snapshot.title.match(/[!?]/g) ?? []).length;
  const shortInflatedTitle = snapshot.wordCount < 250 && titleWords >= 8 ? 20 : 0;
  const lowOverlap = signals.titleContentOverlap < 0.25 ? 24 : signals.titleContentOverlap < 0.5 ? 10 : 0;
  const fillerCount = signals.listicleMatches.length;
  const repeatedRisk = signals.repetition.repeatedPhraseRatio * 220
    + signals.repetition.duplicateParagraphPairs * 16;
  const similarPages = similarFingerprintPages(snapshot.title, context.fingerprints, snapshot.url);
  const regrettedSimilar = similarPages.filter((page) => page.sentiment === 'regretted');
  const domain = context.domainStats;
  const domainTotal = domain
    ? domain.worthIt + domain.shallow + domain.ragebait + domain.distracting + domain.duplicate
    : 0;
  const domainRegrets = domain
    ? domain.shallow + domain.ragebait + domain.distracting + domain.duplicate
    : 0;
  const sourceHistory = domainTotal === 0
    ? 0
    : 100 * ((domainRegrets + 2) / (domainTotal + 4));

  return {
    clickbait: clamp(
      signals.clickbaitMatches.length * 24
      + signals.hypeMatches.length * 9
      + signals.listicleMatches.length * 8
      + punctuationHype * 6
      + countAllCapsWords(snapshot.title) * 8
      + shortInflatedTitle,
    ),
    informationDensity: clamp(
      contentLengthRisk(snapshot.wordCount)
      + fillerCount * 10
      + lowOverlap
      + paragraphLengthRisk(signals.averageParagraphWords)
      + Math.max(0, signals.linksPerHundredWords - 4) * 2,
    ),
    novelty: clamp(
      repeatedRisk
      + regrettedSimilar.reduce((sum, page) => sum + page.similarity * 25, 0)
      + (similarPages.length >= 3 ? 12 : 0),
    ),
    emotionalManipulation: clamp(
      signals.emotionalMatches.length * 18
      + signals.hypeMatches.length * 8
      + punctuationHype * 5,
    ),
    distractionRisk: clamp(
      Math.max(0, signals.linksPerHundredWords - 2) * 5
      + fillerCount * 8
      + (snapshot.paragraphCount === 0 ? 20 : 0),
    ),
    sourceHistory: clamp(
      sourceHistory
      + regrettedSimilar.reduce((sum, page) => sum + page.similarity * 12, 0),
    ),
  };
}

export function adjustForSensitivity(baseScore: number, sensitivity: Sensitivity): number {
  if (sensitivity === 'low') return clamp(baseScore * 0.85 - 3);
  if (sensitivity === 'high') return clamp(baseScore * 1.15 + 3);
  return clamp(baseScore);
}

export function riskLabel(score: number): RiskLabel {
  if (score <= 25) return 'Worth it';
  if (score <= 50) return 'Mixed';
  if (score <= 75) return 'Low-signal';
  return 'High regret risk';
}

function buildReasons(
  snapshot: PageSnapshot,
  dimensions: DimensionScores,
  signals: ExtractedSignals,
  similarRegrets: number,
): string[] {
  const reasons: Array<{ risk: number; text: string }> = [];
  if (signals.clickbaitMatches.length > 0 || signals.hypeMatches.length > 0) {
    reasons.push({ risk: dimensions.clickbait, text: 'The title or description uses clickbait or promotional phrasing.' });
  }
  if (snapshot.wordCount < 250) {
    reasons.push({ risk: 70 - snapshot.wordCount / 5, text: `The page is short (${snapshot.wordCount} words), so the title may promise more than it delivers.` });
  }
  if (signals.titleContentOverlap < 0.5) {
    reasons.push({ risk: (1 - signals.titleContentOverlap) * 60, text: 'Few meaningful title terms appear in the body content.' });
  }
  if (signals.listicleMatches.length > 0) {
    reasons.push({ risk: signals.listicleMatches.length * 12, text: 'Listicle or search-optimized filler language lowers information density.' });
  }
  if (signals.emotionalMatches.length > 0) {
    reasons.push({ risk: dimensions.emotionalManipulation, text: 'Emotionally loaded language may be trying to provoke a reaction.' });
  }
  if (signals.repetition.duplicateParagraphPairs > 0 || signals.repetition.repeatedPhraseRatio > 0.04) {
    reasons.push({ risk: dimensions.novelty, text: 'Repeated paragraphs or phrases suggest limited new information.' });
  }
  if (signals.linksPerHundredWords > 5) {
    reasons.push({ risk: dimensions.distractionRisk, text: `There are ${signals.linksPerHundredWords.toFixed(1)} links per 100 words.` });
  }
  if (dimensions.sourceHistory >= 50) {
    reasons.push({ risk: dimensions.sourceHistory, text: 'Your prior feedback for this source leans negative.' });
  }
  if (similarRegrets > 0) {
    reasons.push({ risk: dimensions.novelty, text: `${similarRegrets} similar previously rated page${similarRegrets === 1 ? '' : 's'} were regretted.` });
  }

  const fallbacks = [
    { risk: dimensions.informationDensity, text: dimensions.informationDensity < 25 ? 'The content length and structure show reasonable information density.' : 'Content structure presents some low-density risk.' },
    { risk: dimensions.distractionRisk, text: dimensions.distractionRisk < 25 ? 'The link-to-word ratio shows limited distraction risk.' : 'The link-to-word ratio may encourage extra browsing.' },
    { risk: dimensions.novelty, text: dimensions.novelty < 25 ? 'No strong repetition or duplicate-title signal was found.' : 'Some repetition or title similarity reduces novelty.' },
  ];
  const selected = reasons.sort((a, b) => b.risk - a.risk).map(({ text }) => text);
  for (const fallback of fallbacks) {
    if (selected.length >= 3) break;
    if (!selected.includes(fallback.text)) selected.push(fallback.text);
  }
  return selected.slice(0, 6);
}

export function analyzePage(snapshot: PageSnapshot, context: AnalyzerContext): ScoreResult {
  const signals = extractSignals(snapshot);
  const similarPages = similarFingerprintPages(snapshot.title, context.fingerprints, snapshot.url);
  const dimensions = scoreDimensions(snapshot, context, signals);
  const baseScore = clamp(
    Object.entries(DIMENSION_WEIGHTS).reduce(
      (sum, [dimension, weight]) => sum + dimensions[dimension as keyof DimensionScores] * weight,
      0,
    ),
  );
  const score = adjustForSensitivity(baseScore, context.settings.sensitivity);
  const suspiciousPhrases = unique([
    ...signals.clickbaitMatches,
    ...signals.emotionalMatches,
    ...signals.hypeMatches,
    ...signals.listicleMatches,
    ...signals.repetition.repeatedPhrases.slice(0, 3),
  ]).slice(0, 12);

  return {
    score,
    baseScore,
    label: riskLabel(score),
    dimensions,
    reasons: buildReasons(
      snapshot,
      dimensions,
      signals,
      similarPages.filter((page) => page.sentiment === 'regretted').length,
    ),
    suspiciousPhrases,
    signals,
    similarPages,
  };
}

export { DIMENSION_WEIGHTS };
