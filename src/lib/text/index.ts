import type { FeedbackKind, FingerprintRecord, RepetitionEvidence, SimilarPage } from '../types';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'for', 'from',
  'had', 'has', 'have', 'he', 'her', 'his', 'how', 'i', 'in', 'is', 'it', 'its',
  'of', 'on', 'or', 'our', 'she', 'that', 'the', 'their', 'this', 'to', 'was',
  'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with',
  'you', 'your',
]);

export const CLICKBAIT_PHRASES = [
  "you won't believe", 'what happens next', 'this one trick', 'the reason why',
  'will shock you', 'changed everything', 'can we talk about', 'nobody is talking about',
  'here is why', 'must see', 'before you die',
] as const;

export const EMOTIONAL_PHRASES = [
  'outrageous', 'infuriating', 'heartbreaking', 'terrifying', 'disgusting',
  'devastating', 'furious', 'panic', 'hate', 'shameful', 'betrayal',
] as const;

export const HYPE_PHRASES = [
  'ultimate', 'revolutionary', 'game-changing', 'groundbreaking', 'unprecedented',
  'incredible', 'amazing', 'mind-blowing', 'best ever', 'secret', 'guaranteed',
] as const;

export const LISTICLE_PHRASES = [
  'top 10', 'top ten', 'best ways', 'reasons why', 'things you need to know',
  'tips and tricks', 'complete guide', 'ultimate guide', 'everything you need to know',
] as const;

export const SEO_FILLER_PHRASES = [
  'in today’s world', "in today's world", 'in this article', 'it is important to note',
  'when it comes to', 'at the end of the day', 'without further ado',
  'in conclusion', 'as we all know', 'let us dive in', "let's dive in",
] as const;

export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[^\p{L}\p{N}'-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function words(value: string): string[] {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(' ') : [];
}

export function meaningfulTerms(value: string): string[] {
  return words(value)
    .map((word) => word.replace(/^[-']+|[-']+$/g, ''))
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

export function fingerprintTitle(title: string, limit = 16): string[] {
  return [...new Set(meaningfulTerms(title))].sort().slice(0, limit);
}

export function findPhrases(value: string, phrases: readonly string[]): string[] {
  const normalized = ` ${normalizeText(value)} `;
  return phrases.filter((phrase) => normalized.includes(` ${normalizeText(phrase)} `));
}

export function ratio(part: number, total: number): number {
  return total > 0 ? part / total : 0;
}

export function jaccardSimilarity(left: readonly string[], right: readonly string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const term of a) {
    if (b.has(term)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

export function titleContentOverlap(title: string, text: string): number {
  const titleTerms = [...new Set(meaningfulTerms(title))];
  if (titleTerms.length === 0) return 0;
  const contentTerms = new Set(meaningfulTerms(text));
  return ratio(titleTerms.filter((term) => contentTerms.has(term)).length, titleTerms.length);
}

export function repetitionEvidence(paragraphs: readonly string[]): RepetitionEvidence {
  const normalized = paragraphs.map(normalizeText).filter(Boolean);
  let duplicateParagraphPairs = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = i + 1; j < normalized.length; j += 1) {
      if (normalized[i] === normalized[j]) duplicateParagraphPairs += 1;
    }
  }

  const phraseCounts = new Map<string, number>();
  let phraseWindows = 0;
  for (const paragraph of normalized) {
    const tokens = words(paragraph);
    for (let index = 0; index <= tokens.length - 4; index += 1) {
      const phrase = tokens.slice(index, index + 4).join(' ');
      phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
      phraseWindows += 1;
    }
  }
  const repeated = [...phraseCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort(([phraseA, countA], [phraseB, countB]) => countB - countA || phraseA.localeCompare(phraseB));
  const repeatedWindows = repeated.reduce((sum, [, count]) => sum + count - 1, 0);

  return {
    duplicateParagraphPairs,
    repeatedPhraseRatio: ratio(repeatedWindows, phraseWindows),
    repeatedPhrases: repeated.slice(0, 8).map(([phrase]) => phrase),
  };
}

export function similarFingerprintPages(
  title: string,
  fingerprints: readonly FingerprintRecord[],
  currentUrl?: string,
  minimumSimilarity = 0.35,
): SimilarPage[] {
  const terms = fingerprintTitle(title);
  return fingerprints
    .filter((record) => record.url !== currentUrl)
    .map((record) => ({ record, similarity: jaccardSimilarity(terms, record.terms) }))
    .filter(({ similarity }) => similarity >= minimumSimilarity)
    .sort((a, b) => b.similarity - a.similarity || b.record.createdAt.localeCompare(a.record.createdAt))
    .slice(0, 5)
    .map(({ record, similarity }) => ({
      url: record.url,
      title: record.title,
      domain: record.domain,
      similarity: Math.round(similarity * 100) / 100,
      sentiment: record.sentiment,
      feedback: record.feedback,
      createdAt: record.createdAt,
    }));
}

export function feedbackSentiment(kind: FeedbackKind): 'regretted' | 'worth_it' {
  return kind === 'worth_it' ? 'worth_it' : 'regretted';
}
