import type {
  AnalysisReport,
  DomainStats,
  ExportPayload,
  FeedbackKind,
  FeedbackRecord,
  FingerprintRecord,
  SavedPage,
  Settings,
  StorageState,
} from '../types';
import { feedbackSentiment, fingerprintTitle } from '../text';

export const STORAGE_KEY = 'regretBrowserState';
export const STORAGE_LIMITS = {
  feedback: 500,
  fingerprints: 500,
  savedPages: 200,
  reports: 30,
} as const;

const DEFAULT_SETTINGS: Settings = {
  badgeEnabled: true,
  sensitivity: 'medium',
  hiddenDomains: [],
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/^[a-z][a-z\d+.-]*:\/\//, '')
    .split(/[/?#]/, 1)[0]!
    .replace(/:\d+$/, '')
    .replace(/^www\./, '')
    .replace(/\.$/, '');
}

function normalizeSettings(value: unknown): Settings {
  const record = isRecord(value) ? value : {};
  const sensitivity = record.sensitivity;
  const hiddenDomains = Array.isArray(record.hiddenDomains)
    ? record.hiddenDomains
      .filter((domain): domain is string => typeof domain === 'string')
      .map(normalizeDomain)
      .filter(Boolean)
    : [];
  return {
    badgeEnabled: typeof record.badgeEnabled === 'boolean' ? record.badgeEnabled : DEFAULT_SETTINGS.badgeEnabled,
    sensitivity: sensitivity === 'low' || sensitivity === 'high' ? sensitivity : 'medium',
    hiddenDomains: [...new Set(hiddenDomains)].sort(),
  };
}

function normalizeDomainStats(value: unknown): Record<string, DomainStats> {
  if (!isRecord(value)) return {};
  const result: Record<string, DomainStats> = {};
  for (const candidate of Object.values(value)) {
    if (!isRecord(candidate) || typeof candidate.domain !== 'string') continue;
    const domain = normalizeDomain(candidate.domain);
    if (!domain) continue;
    result[domain] = {
      domain,
      worthIt: nonNegativeInteger(candidate.worthIt),
      shallow: nonNegativeInteger(candidate.shallow),
      ragebait: nonNegativeInteger(candidate.ragebait),
      distracting: nonNegativeInteger(candidate.distracting),
      duplicate: nonNegativeInteger(candidate.duplicate),
      updatedAt: stringValue(candidate.updatedAt) ?? new Date(0).toISOString(),
    };
  }
  return result;
}

const FEEDBACK_KINDS = new Set<FeedbackKind>(['worth_it', 'shallow', 'ragebait', 'distracting', 'duplicate']);

function isFeedbackKind(value: unknown): value is FeedbackKind {
  return typeof value === 'string' && FEEDBACK_KINDS.has(value as FeedbackKind);
}

function normalizeFeedback(value: unknown): FeedbackRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): FeedbackRecord[] => {
    if (
      !isRecord(candidate)
      || typeof candidate.id !== 'string'
      || typeof candidate.url !== 'string'
      || typeof candidate.domain !== 'string'
      || typeof candidate.title !== 'string'
      || !isFeedbackKind(candidate.kind)
      || typeof candidate.createdAt !== 'string'
    ) return [];
    return [{
      id: candidate.id,
      url: candidate.url,
      domain: normalizeDomain(candidate.domain),
      title: candidate.title,
      kind: candidate.kind,
      fingerprint: Array.isArray(candidate.fingerprint)
        ? candidate.fingerprint.filter((term): term is string => typeof term === 'string')
        : fingerprintTitle(candidate.title),
      createdAt: candidate.createdAt,
    }];
  }).slice(-STORAGE_LIMITS.feedback);
}

function normalizeFingerprints(value: unknown): FingerprintRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): FingerprintRecord[] => {
    if (
      !isRecord(candidate)
      || typeof candidate.id !== 'string'
      || typeof candidate.url !== 'string'
      || typeof candidate.domain !== 'string'
      || typeof candidate.title !== 'string'
      || !isFeedbackKind(candidate.feedback)
      || typeof candidate.createdAt !== 'string'
    ) return [];
    const sentiment = candidate.sentiment === 'worth_it' ? 'worth_it' : 'regretted';
    return [{
      id: candidate.id,
      url: candidate.url,
      domain: normalizeDomain(candidate.domain),
      title: candidate.title,
      terms: Array.isArray(candidate.terms)
        ? candidate.terms.filter((term): term is string => typeof term === 'string')
        : fingerprintTitle(candidate.title),
      feedback: candidate.feedback,
      sentiment,
      createdAt: candidate.createdAt,
    }];
  }).slice(-STORAGE_LIMITS.fingerprints);
}

function normalizeSavedPages(value: unknown): SavedPage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): SavedPage[] => {
    if (
      !isRecord(candidate)
      || typeof candidate.url !== 'string'
      || typeof candidate.title !== 'string'
      || typeof candidate.domain !== 'string'
      || typeof candidate.savedAt !== 'string'
    ) return [];
    return [{
      url: candidate.url,
      title: candidate.title,
      domain: normalizeDomain(candidate.domain),
      savedAt: candidate.savedAt,
    }];
  }).slice(-STORAGE_LIMITS.savedPages);
}

function normalizeReports(value: unknown): Record<string, AnalysisReport> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, report]) => isRecord(report) && typeof report.id === 'string')
      .slice(-STORAGE_LIMITS.reports),
  ) as Record<string, AnalysisReport>;
}

export function createDefaultState(): StorageState {
  return {
    schemaVersion: 1,
    settings: { ...DEFAULT_SETTINGS, hiddenDomains: [] },
    domainStats: {},
    feedback: [],
    fingerprints: [],
    savedPages: [],
    reports: {},
  };
}

export function normalizeStorageState(value: unknown): StorageState {
  const record = isRecord(value) ? value : {};
  const reports = normalizeReports(record.reports);
  const latestReportId = typeof record.latestReportId === 'string' && reports[record.latestReportId]
    ? record.latestReportId
    : undefined;
  return {
    schemaVersion: 1,
    settings: normalizeSettings(record.settings),
    domainStats: normalizeDomainStats(record.domainStats),
    feedback: normalizeFeedback(record.feedback),
    fingerprints: normalizeFingerprints(record.fingerprints),
    savedPages: normalizeSavedPages(record.savedPages),
    reports,
    ...(latestReportId ? { latestReportId } : {}),
  };
}

export function updateSettings(state: StorageState, patch: Partial<Settings>): StorageState {
  return {
    ...state,
    settings: normalizeSettings({ ...state.settings, ...patch }),
  };
}

export function hideDomain(state: StorageState, domain: string): StorageState {
  const normalized = normalizeDomain(domain);
  if (!normalized) return state;
  return updateSettings(state, {
    hiddenDomains: [...state.settings.hiddenDomains, normalized],
  });
}

export function cacheReport(state: StorageState, report: AnalysisReport): StorageState {
  const entries = [...Object.entries(state.reports).filter(([id]) => id !== report.id), [report.id, report] as const]
    .slice(-STORAGE_LIMITS.reports);
  return {
    ...state,
    reports: Object.fromEntries(entries),
    latestReportId: report.id,
  };
}

export function savePage(state: StorageState, reportId: string, savedAt = new Date().toISOString()): StorageState {
  const report = state.reports[reportId];
  if (!report) return state;
  const saved: SavedPage = {
    url: report.snapshot.url,
    title: report.snapshot.title,
    domain: normalizeDomain(report.snapshot.domain),
    savedAt,
  };
  return {
    ...state,
    savedPages: [...state.savedPages.filter((page) => page.url !== saved.url), saved]
      .slice(-STORAGE_LIMITS.savedPages),
  };
}

function incrementDomain(stats: DomainStats, kind: FeedbackKind): DomainStats {
  const key: keyof Pick<DomainStats, 'worthIt' | 'shallow' | 'ragebait' | 'distracting' | 'duplicate'> =
    kind === 'worth_it' ? 'worthIt' : kind;
  return { ...stats, [key]: stats[key] + 1 };
}

function createDomainStats(domain: string, updatedAt: string): DomainStats {
  return {
    domain,
    worthIt: 0,
    shallow: 0,
    ragebait: 0,
    distracting: 0,
    duplicate: 0,
    updatedAt,
  };
}

export function addFeedback(
  state: StorageState,
  reportId: string,
  kind: FeedbackKind,
  createdAt = new Date().toISOString(),
): StorageState {
  const report = state.reports[reportId];
  if (!report || state.feedback.some((record) => record.id === reportId)) return state;
  const { snapshot } = report;
  const domain = normalizeDomain(snapshot.domain);
  const terms = fingerprintTitle(snapshot.title);
  const feedback: FeedbackRecord = {
    id: reportId,
    url: snapshot.url,
    domain,
    title: snapshot.title,
    kind,
    fingerprint: terms,
    createdAt,
  };
  const fingerprint: FingerprintRecord = {
    id: reportId,
    url: snapshot.url,
    domain,
    title: snapshot.title,
    terms,
    feedback: kind,
    sentiment: feedbackSentiment(kind),
    createdAt,
  };
  const currentStats = state.domainStats[domain] ?? createDomainStats(domain, createdAt);
  return {
    ...state,
    domainStats: {
      ...state.domainStats,
      [domain]: { ...incrementDomain(currentStats, kind), updatedAt: createdAt },
    },
    feedback: [...state.feedback, feedback].slice(-STORAGE_LIMITS.feedback),
    fingerprints: [...state.fingerprints, fingerprint].slice(-STORAGE_LIMITS.fingerprints),
  };
}

export function createExportPayload(state: StorageState, exportedAt = new Date().toISOString()): ExportPayload {
  return {
    product: 'regret-browser',
    version: 1,
    exportedAt,
    data: {
      settings: state.settings,
      domainStats: state.domainStats,
      feedback: state.feedback,
      fingerprints: state.fingerprints,
      savedPages: state.savedPages,
    },
  };
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum;
}

function isValidDate(value: unknown): value is string {
  return isBoundedString(value, 40) && Number.isFinite(Date.parse(value));
}

function isValidHttpUrl(value: unknown): value is string {
  if (!isBoundedString(value, 4_096)) return false;
  try {
    return /^https?:$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isStringList(value: unknown, maximumItems: number, maximumLength: number): value is string[] {
  return Array.isArray(value)
    && value.length <= maximumItems
    && value.every((item) => isBoundedString(item, maximumLength));
}

function isValidDomainStats(value: unknown): value is DomainStats {
  if (!isRecord(value) || !isBoundedString(value.domain, 253) || !isValidDate(value.updatedAt)) return false;
  return ['worthIt', 'shallow', 'ragebait', 'distracting', 'duplicate']
    .every((key) => Number.isInteger(value[key]) && (value[key] as number) >= 0);
}

function isValidFeedback(value: unknown): value is FeedbackRecord {
  return isRecord(value)
    && isBoundedString(value.id, 200)
    && isValidHttpUrl(value.url)
    && isBoundedString(value.domain, 253)
    && isBoundedString(value.title, 1_000)
    && isFeedbackKind(value.kind)
    && isStringList(value.fingerprint, 30, 100)
    && isValidDate(value.createdAt);
}

function isValidFingerprint(value: unknown): value is FingerprintRecord {
  return isRecord(value)
    && isBoundedString(value.id, 200)
    && isValidHttpUrl(value.url)
    && isBoundedString(value.domain, 253)
    && isBoundedString(value.title, 1_000)
    && isStringList(value.terms, 30, 100)
    && isFeedbackKind(value.feedback)
    && value.sentiment === feedbackSentiment(value.feedback)
    && isValidDate(value.createdAt);
}

function isValidSavedPage(value: unknown): value is SavedPage {
  return isRecord(value)
    && isValidHttpUrl(value.url)
    && isBoundedString(value.title, 1_000)
    && isBoundedString(value.domain, 253)
    && isValidDate(value.savedAt);
}

function hasValidExportData(data: UnknownRecord): boolean {
  const settings = data.settings;
  const stats = data.domainStats;
  return isRecord(settings)
    && typeof settings.badgeEnabled === 'boolean'
    && (settings.sensitivity === 'low' || settings.sensitivity === 'medium' || settings.sensitivity === 'high')
    && isStringList(settings.hiddenDomains, 500, 253)
    && isRecord(stats)
    && Object.keys(stats).length <= 2_000
    && Object.values(stats).every(isValidDomainStats)
    && Array.isArray(data.feedback)
    && data.feedback.length <= STORAGE_LIMITS.feedback
    && data.feedback.every(isValidFeedback)
    && Array.isArray(data.fingerprints)
    && data.fingerprints.length <= STORAGE_LIMITS.fingerprints
    && data.fingerprints.every(isValidFingerprint)
    && Array.isArray(data.savedPages)
    && data.savedPages.length <= STORAGE_LIMITS.savedPages
    && data.savedPages.every(isValidSavedPage);
}

export function parseExportPayload(value: unknown): ExportPayload {
  if (
    !isRecord(value)
    || value.product !== 'regret-browser'
    || value.version !== 1
    || typeof value.exportedAt !== 'string'
    || !isRecord(value.data)
    || !hasValidExportData(value.data)
    || new TextEncoder().encode(JSON.stringify(value)).byteLength > 2_000_000
  ) {
    throw new Error('Invalid Regret Browser export');
  }
  const normalized = normalizeStorageState(value.data);
  return createExportPayload(normalized, value.exportedAt);
}

export function importExportPayload(current: StorageState, value: unknown): StorageState {
  const payload = parseExportPayload(value);
  return {
    ...current,
    settings: payload.data.settings,
    domainStats: payload.data.domainStats,
    feedback: payload.data.feedback,
    fingerprints: payload.data.fingerprints,
    savedPages: payload.data.savedPages,
  };
}

export interface LocalStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface RegretStorage {
  load(): Promise<StorageState>;
  save(state: StorageState): Promise<void>;
  update(operation: (state: StorageState) => StorageState): Promise<StorageState>;
}

export function createStorage(area: LocalStorageArea): RegretStorage {
  let updateQueue: Promise<void> = Promise.resolve();

  async function load(): Promise<StorageState> {
    const stored = await area.get(STORAGE_KEY);
    return normalizeStorageState(stored[STORAGE_KEY]);
  }

  async function save(state: StorageState): Promise<void> {
    await area.set({ [STORAGE_KEY]: normalizeStorageState(state) });
  }

  return {
    load,
    save,
    update(operation) {
      const run = updateQueue.then(async (): Promise<StorageState> => {
        const current = await load();
        const updated = normalizeStorageState(operation(current));
        await save(updated);
        return updated;
      });
      updateQueue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

export function createChromeStorage(): RegretStorage {
  return createStorage(chrome.storage.local);
}

let chromeStorage: RegretStorage | undefined;

function repositoryStorage(): RegretStorage {
  chromeStorage ??= createChromeStorage();
  return chromeStorage;
}

export const storageRepository = {
  async getSettings(): Promise<Settings> {
    return (await repositoryStorage().load()).settings;
  },
  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const state = await repositoryStorage().update((current) => updateSettings(current, patch));
    return state.settings;
  },
  async getDomainStats(domain: string): Promise<DomainStats | undefined> {
    return (await repositoryStorage().load()).domainStats[normalizeDomain(domain)];
  },
  async getFingerprints(): Promise<FingerprintRecord[]> {
    return (await repositoryStorage().load()).fingerprints;
  },
  async getFeedback(domain?: string, url?: string): Promise<FeedbackRecord[]> {
    const feedback = (await repositoryStorage().load()).feedback;
    const normalized = domain ? normalizeDomain(domain) : undefined;
    return feedback
      .filter((record) => (!normalized || record.domain === normalized) && (!url || record.url === url))
      .slice()
      .reverse();
  },
  async saveReport(report: AnalysisReport): Promise<void> {
    await repositoryStorage().update((current) => cacheReport(current, report));
  },
  async getReport(reportId: string): Promise<AnalysisReport | undefined> {
    return (await repositoryStorage().load()).reports[reportId];
  },
  async getLatestReport(): Promise<AnalysisReport | undefined> {
    const state = await repositoryStorage().load();
    return state.latestReportId ? state.reports[state.latestReportId] : undefined;
  },
  async addFeedback(reportId: string, kind: FeedbackKind): Promise<void> {
    await repositoryStorage().update((current) => addFeedback(current, reportId, kind));
  },
  async savePage(page: SavedPage): Promise<void> {
    await repositoryStorage().update((current) => ({
      ...current,
      savedPages: [...current.savedPages.filter((saved) => saved.url !== page.url), {
        ...page,
        domain: normalizeDomain(page.domain),
      }].slice(-STORAGE_LIMITS.savedPages),
    }));
  },
  async hideDomain(domain: string): Promise<void> {
    await repositoryStorage().update((current) => hideDomain(current, domain));
  },
  async clearAll(): Promise<void> {
    await repositoryStorage().update(() => createDefaultState());
  },
  async exportData(): Promise<ExportPayload> {
    return createExportPayload(await repositoryStorage().load());
  },
  async importData(payload: unknown): Promise<void> {
    await repositoryStorage().update((current) => importExportPayload(current, payload));
  },
};
