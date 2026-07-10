import type {
  AnalysisReport,
  ExportPayload,
  FeedbackKind,
  RuntimeRequest,
  RuntimeResponse,
  Settings,
} from '../lib/types';

export interface AnalysisEnvelope {
  report: AnalysisReport;
  badgeEnabled: boolean;
}

function sendMessage<T>(request: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(request, (response: RuntimeResponse<T> | undefined) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error('Regret Browser did not respond.'));
        return;
      }
      if (!response.ok) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.data);
    });
  });
}

export function sendRequest<T>(request: RuntimeRequest): Promise<T> {
  return sendMessage<T>(request);
}

export type OptionsMessage =
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> }
  | { type: 'CLEAR_DATA' }
  | { type: 'EXPORT_DATA' }
  | { type: 'IMPORT_DATA'; payload: ExportPayload };

export function sendOptionsRequest<T>(request: OptionsMessage): Promise<T> {
  return sendMessage<T>(request);
}

export const feedbackLabels: Record<FeedbackKind, string> = {
  worth_it: 'Worth it',
  shallow: 'Shallow',
  ragebait: 'Ragebait',
  distracting: 'Distracting',
  duplicate: 'Duplicate',
};

export function scoreTone(score: number): 'good' | 'mixed' | 'risk' {
  if (score <= 25) return 'good';
  if (score <= 75) return 'mixed';
  return 'risk';
}

export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
