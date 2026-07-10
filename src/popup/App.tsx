import { useEffect, useState } from 'react';
import type { AnalysisReport, FeedbackKind } from '../lib/types';
import { DimensionList, EmptyState, ScoreMark } from '../ui/components';
import { feedbackLabels, sendRequest, type AnalysisEnvelope } from '../ui/runtime';
import '../ui/styles.css';
import './popup.css';

const feedbackKinds: FeedbackKind[] = ['worth_it', 'shallow', 'ragebait', 'distracting', 'duplicate'];

export function App(): React.JSX.Element {
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackKind | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    sendRequest<AnalysisEnvelope>({ type: 'ANALYZE_ACTIVE_TAB' })
      .then(({ report: nextReport }) => setReport(nextReport))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  async function submit(kind: FeedbackKind): Promise<void> {
    if (!report || feedback) return;
    setFeedback(kind);
    try {
      await sendRequest<void>({ type: 'SUBMIT_FEEDBACK', reportId: report.id, feedback: kind });
    } catch (reason) {
      setFeedback(null);
      setError(reason instanceof Error ? reason.message : 'Could not save feedback.');
    }
  }

  async function savePage(): Promise<void> {
    if (!report) return;
    await sendRequest<void>({ type: 'SAVE_PAGE', reportId: report.id });
    setSaved(true);
  }

  async function hideDomain(): Promise<void> {
    if (!report) return;
    await sendRequest<void>({ type: 'HIDE_DOMAIN', domain: report.snapshot.domain });
    setReport({ ...report, hidden: true });
  }

  return (
    <main className="popup stack">
      <header className="row spread">
        <div>
          <p className="eyebrow">Regret Browser</p>
          <strong>Is this worth your attention?</strong>
        </div>
        <button className="icon-button" title="Open settings" aria-label="Open settings" onClick={() => chrome.runtime.openOptionsPage()}>⚙</button>
      </header>

      {loading && <div className="status" role="status">Reading this page locally…</div>}
      {error && <EmptyState title="Unavailable" detail={error} />}
      {report?.hidden && (
        <div className="stack">
          <EmptyState title="Warnings hidden" detail={`Regret Browser will not show scores on ${report.snapshot.domain}. Manage hidden domains in settings.`} />
          <button onClick={() => chrome.runtime.openOptionsPage()}>Manage hidden domains</button>
        </div>
      )}
      {report && !report.hidden && (
        <>
          <section className="surface stack">
            <ScoreMark report={report} />
            <p className="eyebrow">{report.snapshot.domain}</p>
            <p className="page-title">{report.snapshot.title || report.snapshot.domain}</p>
            <ul className="reasons">
              {report.result.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
            <DimensionList report={report} />
          </section>
          <section>
            <p className="muted feedback-prompt">{feedback ? 'Thanks — your feedback stays on this device.' : 'How did this page feel?'}</p>
            <div className="feedback-grid" aria-label="Page feedback">
              {feedbackKinds.map((kind) => (
                <button
                  className={feedback === kind ? 'selected' : ''}
                  disabled={feedback !== null}
                  key={kind}
                  onClick={() => void submit(kind)}
                >
                  {feedbackLabels[kind]}
                </button>
              ))}
            </div>
          </section>
          <footer className="row">
            <button className="primary grow" onClick={() => sendRequest({ type: 'OPEN_REPORT', reportId: report.id })}>Full report</button>
            <button onClick={() => void savePage()} disabled={saved}>{saved ? 'Saved' : 'Save for later'}</button>
          </footer>
          <button className="quiet-action" onClick={() => void hideDomain()}>Hide score on this domain</button>
        </>
      )}
      <p className="privacy-note">Analyzed on-device. Page text is not uploaded.</p>
    </main>
  );
}
