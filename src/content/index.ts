import type { AnalysisReport, RuntimeRequest, RuntimeResponse } from '../lib/types';
import { canAnalyzeCurrentPage, extractPageSnapshot } from './extract';

interface AnalysisEnvelope {
  report: AnalysisReport;
  badgeEnabled: boolean;
}

const HOST_ID = 'regret-browser-root';
const URL_CHECK_INTERVAL_MS = 500;
const MAX_SPARSE_RETRIES = 3;
let badgeHost: HTMLElement | null = null;
let lastUrl = location.href;
let analysisTimer: number | undefined;
let analysisGeneration = 0;
let sparseRetries = 0;
let waitingForContent = false;

const contentObserver = new MutationObserver(() => {
  if (!waitingForContent) return;
  waitingForContent = false;
  sparseRetries += 1;
  scheduleAnalysis();
});
contentObserver.observe(document.documentElement, {
  childList: true,
  characterData: true,
  subtree: true,
});

function removeBadge(): void {
  badgeHost?.remove();
  badgeHost = null;
}

function badgeTone(score: number): string {
  if (score <= 25) return '#315b34';
  if (score <= 75) return '#775b16';
  return '#8a3029';
}

function renderBadge(report: AnalysisReport, enabled: boolean): void {
  removeBadge();
  if (!enabled || report.hidden) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  badgeHost = host;
  const shadow = host.attachShadow({ mode: 'closed' });
  const button = document.createElement('button');
  const score = report.result.score;
  const tone = badgeTone(score);
  button.type = 'button';
  button.setAttribute('aria-label', `Open Regret Browser report. Risk score ${score} out of 100.`);
  button.innerHTML = `<span aria-hidden="true">R</span><strong>${score}</strong>`;
  button.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_REPORT', reportId: report.id } satisfies RuntimeRequest);
  });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    button {
      align-items: center; background: #fbfaf5; border: 1px solid rgba(20,25,18,.22);
      border-radius: 999px; bottom: 18px; box-shadow: 0 5px 20px rgba(20,25,18,.18);
      color: ${tone}; cursor: pointer; display: flex; font: 600 13px/1 system-ui, sans-serif;
      gap: 6px; padding: 6px 9px 6px 6px; position: fixed; right: 18px; z-index: 2147483647;
    }
    button:hover { background: white; transform: translateY(-1px); }
    button:focus-visible { outline: 3px solid rgba(61,82,49,.35); outline-offset: 2px; }
    span {
      align-items: center; background: ${tone}; border-radius: 50%; color: white; display: flex;
      font: 700 11px/1 Georgia, serif; height: 22px; justify-content: center; width: 22px;
    }
  `;
  shadow.append(style, button);
  document.documentElement.append(host);
}

async function analyze(): Promise<void> {
  if (!canAnalyzeCurrentPage()) return;
  const generation = ++analysisGeneration;
  const analyzedUrl = location.href;
  function isCurrentAnalysis(): boolean {
    return generation === analysisGeneration && location.href === analyzedUrl;
  }

  try {
    const domain = location.hostname.replace(/^www\./, '').toLowerCase();
    const badgeStateResponse: RuntimeResponse<boolean> = await chrome.runtime.sendMessage(
      { type: 'GET_BADGE_STATE', domain } satisfies RuntimeRequest,
    );
    if (!badgeStateResponse.ok || !badgeStateResponse.data) {
      if (isCurrentAnalysis()) removeBadge();
      return;
    }
    const snapshot = extractPageSnapshot();
    if (snapshot.wordCount < 15) {
      waitingForContent = sparseRetries < MAX_SPARSE_RETRIES;
      return;
    }
    waitingForContent = false;
    sparseRetries = 0;
    const response: RuntimeResponse<AnalysisEnvelope> = await chrome.runtime.sendMessage(
      { type: 'ANALYZE_PAGE', snapshot } satisfies RuntimeRequest,
    );
    if (response.ok && isCurrentAnalysis()) {
      renderBadge(response.data.report, response.data.badgeEnabled);
    }
  } catch {
    if (isCurrentAnalysis()) removeBadge();
  }
}

function scheduleAnalysis(): void {
  if (analysisTimer !== undefined) window.clearTimeout(analysisTimer);
  analysisTimer = window.setTimeout(() => {
    analysisTimer = undefined;
    void analyze();
  }, 250);
}

chrome.runtime.onMessage.addListener(function handleMessage(request: RuntimeRequest, _sender, sendResponse) {
  switch (request.type) {
    case 'GET_PAGE_SNAPSHOT':
      if (!canAnalyzeCurrentPage()) {
        sendResponse({ ok: false, error: 'This page cannot be analyzed.' } satisfies RuntimeResponse);
      } else {
        sendResponse({ ok: true, data: extractPageSnapshot() } satisfies RuntimeResponse);
      }
      return;
    case 'REFRESH_BADGE':
      void analyze();
      return;
    case 'REMOVE_BADGE':
      analysisGeneration += 1;
      removeBadge();
      return;
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void analyze(), { once: true });
} else {
  void analyze();
}

window.setInterval(() => {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  analysisGeneration += 1;
  sparseRetries = 0;
  waitingForContent = false;
  removeBadge();
  scheduleAnalysis();
}, URL_CHECK_INTERVAL_MS);
