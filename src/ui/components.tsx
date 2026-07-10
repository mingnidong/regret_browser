import type { AnalysisReport, DimensionKey } from '../lib/types';
import { scoreTone } from './runtime';

const dimensionLabels: Record<DimensionKey, string> = {
  clickbait: 'Clickbait',
  informationDensity: 'Low information density',
  novelty: 'Low novelty',
  emotionalManipulation: 'Emotional pressure',
  distractionRisk: 'Distraction risk',
  sourceHistory: 'Source history',
};

export function ScoreMark({ report }: { report: AnalysisReport }) {
  const { score, label } = report.result;
  return (
    <div className="row">
      <div className={`score tone-${scoreTone(score)}`} aria-label={`Regret risk ${score} out of 100`}>
        {score}<small>/100</small>
      </div>
      <div>
        <p className="eyebrow">Attention forecast</p>
        <h2 style={{ margin: '3px 0' }}>{label}</h2>
        <span className="muted">{report.snapshot.readingTimeMinutes} min read · {report.snapshot.wordCount.toLocaleString()} words</span>
      </div>
    </div>
  );
}

export function DimensionList({ report }: { report: AnalysisReport }) {
  return (
    <div className="stack">
      {Object.entries(report.result.dimensions).map(([key, value]) => (
        <div key={key}>
          <div className="row spread muted">
            <span>{dimensionLabels[key as DimensionKey]}</span>
            <span>{Math.round(value)}</span>
          </div>
          <div className="meter" aria-label={`${dimensionLabels[key as DimensionKey]}: ${Math.round(value)} out of 100`}>
            <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="status" role="status">
      <strong>{title}</strong>
      <div className="muted" style={{ marginTop: 4 }}>{detail}</div>
    </div>
  );
}
