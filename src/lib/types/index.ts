export type Sensitivity = 'low' | 'medium' | 'high';
export type FeedbackKind =
  | 'worth_it'
  | 'shallow'
  | 'ragebait'
  | 'distracting'
  | 'duplicate';

export type RiskLabel = 'Worth it' | 'Mixed' | 'Low-signal' | 'High regret risk';

export interface PageSnapshot {
  url: string;
  domain: string;
  title: string;
  description: string;
  text: string;
  headings: string[];
  paragraphs: string[];
  wordCount: number;
  linkCount: number;
  paragraphCount: number;
  publicationDate?: string;
  readingTimeMinutes: number;
  extractedAt: string;
}

export interface DimensionScores {
  clickbait: number;
  informationDensity: number;
  novelty: number;
  emotionalManipulation: number;
  distractionRisk: number;
  sourceHistory: number;
}

export type DimensionKey = keyof DimensionScores;

export interface RepetitionEvidence {
  duplicateParagraphPairs: number;
  repeatedPhraseRatio: number;
  repeatedPhrases: string[];
}

export interface ExtractedSignals {
  clickbaitMatches: string[];
  emotionalMatches: string[];
  hypeMatches: string[];
  listicleMatches: string[];
  titleContentOverlap: number;
  linksPerHundredWords: number;
  averageParagraphWords: number;
  repetition: RepetitionEvidence;
}

export interface SimilarPage {
  url: string;
  title: string;
  domain: string;
  similarity: number;
  sentiment: 'regretted' | 'worth_it';
  feedback: FeedbackKind;
  createdAt: string;
}

export interface ScoreResult {
  score: number;
  baseScore: number;
  label: RiskLabel;
  dimensions: DimensionScores;
  reasons: string[];
  suspiciousPhrases: string[];
  signals: ExtractedSignals;
  similarPages: SimilarPage[];
}

export interface AnalysisReport {
  id: string;
  snapshot: PageSnapshot;
  result: ScoreResult;
  createdAt: string;
  hidden: boolean;
}

export interface ReportDetails {
  report: AnalysisReport;
  domainStats?: DomainStats;
  feedback: FeedbackRecord[];
}

export interface FeedbackRecord {
  id: string;
  url: string;
  domain: string;
  title: string;
  kind: FeedbackKind;
  fingerprint: string[];
  createdAt: string;
}

export interface DomainStats {
  domain: string;
  worthIt: number;
  shallow: number;
  ragebait: number;
  distracting: number;
  duplicate: number;
  updatedAt: string;
}

export interface FingerprintRecord {
  id: string;
  url: string;
  domain: string;
  title: string;
  terms: string[];
  feedback: FeedbackKind;
  sentiment: 'regretted' | 'worth_it';
  createdAt: string;
}

export interface SavedPage {
  url: string;
  title: string;
  domain: string;
  savedAt: string;
}

export interface Settings {
  badgeEnabled: boolean;
  sensitivity: Sensitivity;
  hiddenDomains: string[];
}

export interface StorageState {
  schemaVersion: 1;
  settings: Settings;
  domainStats: Record<string, DomainStats>;
  feedback: FeedbackRecord[];
  fingerprints: FingerprintRecord[];
  savedPages: SavedPage[];
  reports: Record<string, AnalysisReport>;
  latestReportId?: string;
}

export interface AnalyzerContext {
  settings: Settings;
  domainStats?: DomainStats;
  fingerprints: FingerprintRecord[];
}

export interface ExportPayload {
  product: 'regret-browser';
  version: 1;
  exportedAt: string;
  data: Pick<
    StorageState,
    'settings' | 'domainStats' | 'feedback' | 'fingerprints' | 'savedPages'
  >;
}

export type RuntimeRequest =
  | { type: 'ANALYZE_ACTIVE_TAB' }
  | { type: 'ANALYZE_PAGE'; snapshot: PageSnapshot }
  | { type: 'GET_PAGE_SNAPSHOT' }
  | { type: 'GET_BADGE_STATE'; domain: string }
  | { type: 'GET_LATEST_REPORT' }
  | { type: 'GET_REPORT'; reportId: string }
  | { type: 'GET_REPORT_DETAILS'; reportId: string }
  | { type: 'SUBMIT_FEEDBACK'; reportId: string; feedback: FeedbackKind }
  | { type: 'SAVE_PAGE'; reportId: string }
  | { type: 'HIDE_DOMAIN'; domain: string }
  | { type: 'OPEN_REPORT'; reportId: string }
  | { type: 'BADGE_OPEN_REPORT' }
  | { type: 'REFRESH_BADGE' }
  | { type: 'REMOVE_BADGE' };

export type RuntimeResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };
