import { useEffect, useState } from 'react';
import type { FeedbackKind, ReportDetails } from '../lib/types';
import { DimensionList, EmptyState, ScoreMark } from '../ui/components';
import { displayHost, feedbackLabels, sendRequest } from '../ui/runtime';
import '../ui/styles.css';
import './report.css';

const feedbackKinds: FeedbackKind[] = ['worth_it', 'shallow', 'ragebait', 'distracting', 'duplicate'];

async function loadReportDetails(reportId: string | null): Promise<ReportDetails | null> {
  if (reportId) {
    return sendRequest<ReportDetails>({ type: 'GET_REPORT_DETAILS', reportId });
  }
  const latest = await sendRequest<ReportDetails['report'] | null>({ type: 'GET_LATEST_REPORT' });
  return latest
    ? sendRequest<ReportDetails>({ type: 'GET_REPORT_DETAILS', reportId: latest.id })
    : null;
}

export function App(): React.JSX.Element {
  const [details, setDetails] = useState<ReportDetails | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<FeedbackKind | null>(null);
  const reportId = new URLSearchParams(location.search).get('id');
  const report = details?.report ?? null;

  useEffect(() => {
    loadReportDetails(reportId)
      .then((value) => {
        if (!value) {
          setError('This report is no longer available.');
          return;
        }
        setDetails(value);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [reportId]);

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

  async function hideDomain(): Promise<void> {
    if (!report) return;
    await sendRequest<void>({ type: 'HIDE_DOMAIN', domain: report.snapshot.domain });
    setDetails((current) => current
      ? { ...current, report: { ...current.report, hidden: true } }
      : current);
  }

  return (
    <main className="report-shell">
      <header className="report-header row spread">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>Regret Browser</span>
        </div>
        <button onClick={() => chrome.runtime.openOptionsPage()}>Settings</button>
      </header>
      {error && <EmptyState title="Report unavailable" detail={error} />}
      {!error && !report && <div className="status" role="status">Loading report…</div>}
      {report && (
        <article className="stack report-content">
          <section className="hero surface">
            <div className="stack">
              <p className="eyebrow">{displayHost(report.snapshot.url)}</p>
              <h1>{report.snapshot.title || 'Untitled page'}</h1>
              <p className="quiet">{report.snapshot.description || 'No page description was provided.'}</p>
              <div className="row wrap">
                <a className="button primary" href={report.snapshot.url}>Visit page</a>
                <button onClick={() => void sendRequest({ type: 'SAVE_PAGE', reportId: report.id })}>Save for later</button>
                <button className="danger" disabled={report.hidden} onClick={() => void hideDomain()}>
                  {report.hidden ? 'Domain hidden' : 'Hide badge on domain'}
                </button>
              </div>
            </div>
            <ScoreMark report={report} />
          </section>

          <div className="report-grid">
            <section className="surface stack">
              <div>
                <p className="eyebrow">Why this score</p>
                <h2>Signals that shaped the forecast</h2>
              </div>
              <ol className="reason-list">
                {report.result.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ol>
              {report.result.suspiciousPhrases.length > 0 && (
                <div>
                  <h3>Notable phrases</h3>
                  <div className="row wrap">
                    {report.result.suspiciousPhrases.map((phrase) => <span className="pill" key={phrase}>{phrase}</span>)}
                  </div>
                </div>
              )}
            </section>
            <section className="surface stack">
              <div>
                <p className="eyebrow">Breakdown</p>
                <h2>Risk dimensions</h2>
              </div>
              <DimensionList report={report} />
            </section>
          </div>

          <div className="report-grid">
            <section className="surface stack">
              <div>
                <p className="eyebrow">Extracted evidence</p>
                <h2>Page structure and repetition</h2>
              </div>
              <dl className="signal-grid">
                <div><dt>Words</dt><dd>{report.snapshot.wordCount.toLocaleString()}</dd></div>
                <div><dt>Paragraphs</dt><dd>{report.snapshot.paragraphCount}</dd></div>
                <div><dt>Links</dt><dd>{report.snapshot.linkCount}</dd></div>
                <div><dt>Links / 100 words</dt><dd>{report.result.signals.linksPerHundredWords.toFixed(1)}</dd></div>
                <div><dt>Title/body overlap</dt><dd>{Math.round(report.result.signals.titleContentOverlap * 100)}%</dd></div>
                <div><dt>Repeated paragraph pairs</dt><dd>{report.result.signals.repetition.duplicateParagraphPairs}</dd></div>
              </dl>
              {report.result.signals.repetition.repeatedPhrases.length > 0 && (
                <div>
                  <h3>Repeated phrases</h3>
                  <div className="row wrap">
                    {report.result.signals.repetition.repeatedPhrases.map((phrase) => <span className="pill" key={phrase}>{phrase}</span>)}
                  </div>
                </div>
              )}
              {report.snapshot.publicationDate && <p className="muted">Detected publication date: {report.snapshot.publicationDate}</p>}
            </section>

            <section className="surface stack">
              <div>
                <p className="eyebrow">Your history</p>
                <h2>Source and similar pages</h2>
              </div>
              {details?.domainStats ? (
                <dl className="signal-grid">
                  <div><dt>Worth it</dt><dd>{details.domainStats.worthIt}</dd></div>
                  <div><dt>Shallow</dt><dd>{details.domainStats.shallow}</dd></div>
                  <div><dt>Ragebait</dt><dd>{details.domainStats.ragebait}</dd></div>
                  <div><dt>Distracting</dt><dd>{details.domainStats.distracting}</dd></div>
                  <div><dt>Duplicate</dt><dd>{details.domainStats.duplicate}</dd></div>
                </dl>
              ) : <p className="muted">No previous feedback for this domain.</p>}
              <div>
                <h3>Similar previous pages</h3>
                {report.result.similarPages.length > 0 ? (
                  <ul className="history-list">
                    {report.result.similarPages.map((page) => (
                      <li key={page.url}>
                        <span>{page.title}</span>
                        <small>{Math.round(page.similarity * 100)}% similar · {feedbackLabels[page.feedback]}</small>
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">No similar rated pages found.</p>}
              </div>
              <div>
                <h3>Recent domain feedback</h3>
                {details && details.feedback.length > 0 ? (
                  <ul className="history-list">
                    {details.feedback.slice(0, 8).map((item) => (
                      <li key={item.id}>
                        <span>{item.title}</span>
                        <small>{feedbackLabels[item.kind]} · {new Date(item.createdAt).toLocaleDateString()}</small>
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">No feedback history yet.</p>}
              </div>
            </section>
          </div>

          <section className="surface">
            <div className="row spread wrap">
              <div>
                <h2>Was the forecast useful?</h2>
                <p className="muted">Feedback improves local source history and duplicate detection.</p>
              </div>
              <div className="row wrap">
                {feedbackKinds.map((kind) => (
                  <button disabled={feedback !== null} className={feedback === kind ? 'primary' : ''} key={kind} onClick={() => void submit(kind)}>
                    {feedbackLabels[kind]}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <p className="privacy-copy">Page analysis and feedback stay in your browser. Regret Browser does not send page text to a server.</p>
        </article>
      )}
    </main>
  );
}
