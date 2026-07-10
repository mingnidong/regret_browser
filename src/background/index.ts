import { analyzePage } from '../lib/analyzer';
import { storageRepository } from '../lib/storage';
import type {
  AnalysisReport,
  ExportPayload,
  FeedbackKind,
  PageSnapshot,
  ReportDetails,
  RuntimeRequest,
  RuntimeResponse,
  Settings,
} from '../lib/types';

type ExtendedRequest = RuntimeRequest
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> }
  | { type: 'CLEAR_DATA' }
  | { type: 'EXPORT_DATA' }
  | { type: 'IMPORT_DATA'; payload: ExportPayload };

let dataGeneration = 0;

function id(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function assertAnalyzable(snapshot: PageSnapshot): void {
  if (!/^https?:\/\//.test(snapshot.url)) throw new Error('This browser page cannot be analyzed.');
  if (snapshot.wordCount < 15) throw new Error('There is not enough readable page content to analyze.');
}

async function analyze(snapshot: PageSnapshot): Promise<{ report: AnalysisReport; badgeEnabled: boolean }> {
  const generation = dataGeneration;
  assertAnalyzable(snapshot);
  const [settings, domainStats, fingerprints] = await Promise.all([
    storageRepository.getSettings(),
    storageRepository.getDomainStats(snapshot.domain),
    storageRepository.getFingerprints(),
  ]);
  const hidden = settings.hiddenDomains.includes(snapshot.domain);
  const result = analyzePage(snapshot, { settings, domainStats, fingerprints });
  const report: AnalysisReport = {
    id: id(),
    snapshot: { ...snapshot, text: '', paragraphs: [] },
    result,
    createdAt: new Date().toISOString(),
    hidden,
  };
  if (generation !== dataGeneration) throw new Error('Analysis was cancelled.');
  await storageRepository.saveReport(report);
  return { report, badgeEnabled: settings.badgeEnabled };
}

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) {
    throw new Error('Open a regular web page to analyze it.');
  }
  return tab;
}

async function analyzeActiveTab(): Promise<{ report: AnalysisReport; badgeEnabled: boolean }> {
  const tab = await activeTab();
  const tabId = tab.id;
  if (!tabId) throw new Error('Open a regular web page to analyze it.');
  let response: RuntimeResponse<PageSnapshot>;
  try {
    response = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_SNAPSHOT' } satisfies RuntimeRequest);
  } catch {
    throw new Error('This page is unavailable. Reload it and try again.');
  }
  if (!response.ok) throw new Error(response.error);
  return analyze(response.data);
}

async function openReport(reportId: string): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`report.html?id=${encodeURIComponent(reportId)}`) });
}

async function broadcastToTabs(request: Extract<RuntimeRequest, { type: 'REFRESH_BADGE' | 'REMOVE_BADGE' }>): Promise<void> {
  const tabs = await chrome.tabs.query({});
  const messages = tabs.map((tab) => {
    if (!tab.id) return Promise.resolve();
    return chrome.tabs
      .sendMessage(tab.id, request)
      .catch(() => undefined);
  });
  await Promise.all(messages);
}

function refreshBadges(): Promise<void> {
  return broadcastToTabs({ type: 'REFRESH_BADGE' });
}

function removeBadges(): Promise<void> {
  return broadcastToTabs({ type: 'REMOVE_BADGE' });
}

async function submitFeedback(reportId: string, kind: FeedbackKind): Promise<void> {
  await getReport(reportId);
  await storageRepository.addFeedback(reportId, kind);
}

async function getReport(reportId: string): Promise<AnalysisReport> {
  const report = await storageRepository.getReport(reportId);
  if (!report) throw new Error('That report is no longer available.');
  return report;
}

async function getReportDetails(reportId: string): Promise<ReportDetails> {
  const report = await getReport(reportId);
  const [domainStats, feedback] = await Promise.all([
    storageRepository.getDomainStats(report.snapshot.domain),
    storageRepository.getFeedback(report.snapshot.domain),
  ]);
  return { report, domainStats, feedback };
}

async function savePage(reportId: string): Promise<void> {
  const report = await getReport(reportId);
  await storageRepository.savePage({
    url: report.snapshot.url,
    title: report.snapshot.title,
    domain: report.snapshot.domain,
    savedAt: new Date().toISOString(),
  });
}

async function handle(request: ExtendedRequest): Promise<unknown> {
  switch (request.type) {
    case 'ANALYZE_ACTIVE_TAB': return analyzeActiveTab();
    case 'ANALYZE_PAGE': return analyze(request.snapshot);
    case 'GET_BADGE_STATE': {
      const settings = await storageRepository.getSettings();
      return settings.badgeEnabled && !settings.hiddenDomains.includes(request.domain);
    }
    case 'GET_LATEST_REPORT': return storageRepository.getLatestReport();
    case 'GET_REPORT': return storageRepository.getReport(request.reportId);
    case 'GET_REPORT_DETAILS': return getReportDetails(request.reportId);
    case 'SUBMIT_FEEDBACK':
      await submitFeedback(request.reportId, request.feedback);
      return undefined;
    case 'SAVE_PAGE':
      await savePage(request.reportId);
      return undefined;
    case 'HIDE_DOMAIN':
      await storageRepository.hideDomain(request.domain);
      await refreshBadges();
      return undefined;
    case 'OPEN_REPORT':
      await openReport(request.reportId);
      return undefined;
    case 'BADGE_OPEN_REPORT': {
      const report = await storageRepository.getLatestReport();
      if (!report) throw new Error('Analyze a page first.');
      await openReport(report.id);
      return undefined;
    }
    case 'GET_SETTINGS': return storageRepository.getSettings();
    case 'UPDATE_SETTINGS': {
      const settings = await storageRepository.updateSettings(request.settings);
      await refreshBadges();
      return settings;
    }
    case 'CLEAR_DATA':
      dataGeneration += 1;
      await storageRepository.clearAll();
      await removeBadges();
      return undefined;
    case 'EXPORT_DATA': return storageRepository.exportData();
    case 'IMPORT_DATA':
      await storageRepository.importData(request.payload);
      await refreshBadges();
      return undefined;
    case 'REFRESH_BADGE':
    case 'REMOVE_BADGE':
    case 'GET_PAGE_SNAPSHOT':
      return undefined;
  }
}

chrome.runtime.onMessage.addListener(function handleMessage(request: ExtendedRequest, _sender, sendResponse) {
  handle(request)
    .then((data) => sendResponse({ ok: true, data } satisfies RuntimeResponse))
    .catch((error) => sendResponse({ ok: false, error: errorMessage(error) } satisfies RuntimeResponse));
  return true;
});

chrome.runtime.onInstalled.addListener(function initializeStorage() {
  void storageRepository.getSettings();
});
