import { useEffect, useRef, useState } from 'react';
import type { ExportPayload, Sensitivity, Settings } from '../lib/types';
import { EmptyState } from '../ui/components';
import { sendOptionsRequest } from '../ui/runtime';
import '../ui/styles.css';
import './options.css';

const fallback: Settings = { badgeEnabled: true, sensitivity: 'medium', hiddenDomains: [] };

function normalizeDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function App() {
  const [settings, setSettings] = useState<Settings>(fallback);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [domain, setDomain] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    sendOptionsRequest<Settings>({ type: 'GET_SETTINGS' })
      .then(setSettings)
      .catch((reason: Error) => setStatus(reason.message))
      .finally(() => setLoading(false));
  }, []);

  async function update(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      const stored = await sendOptionsRequest<Settings>({ type: 'UPDATE_SETTINGS', settings: patch });
      setSettings(stored);
      setStatus('Settings saved.');
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'Could not save settings.');
    }
  }

  function addDomain() {
    const normalized = normalizeDomain(domain);
    if (!normalized) {
      setStatus('Enter a valid domain, such as example.com.');
      return;
    }
    if (!settings.hiddenDomains.includes(normalized)) {
      void update({ hiddenDomains: [...settings.hiddenDomains, normalized] });
    }
    setDomain('');
  }

  async function exportData() {
    const payload = await sendOptionsRequest<ExportPayload>({ type: 'EXPORT_DATA' });
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `regret-browser-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('Export created.');
  }

  async function importData(file: File) {
    try {
      const payload = JSON.parse(await file.text()) as ExportPayload;
      if (payload.product !== 'regret-browser' || payload.version !== 1 || !payload.data) {
        throw new Error('This is not a valid Regret Browser export.');
      }
      await sendOptionsRequest<void>({ type: 'IMPORT_DATA', payload });
      const imported = await sendOptionsRequest<Settings>({ type: 'GET_SETTINGS' });
      setSettings(imported);
      setStatus('Import complete.');
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'Import failed.');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }

  async function clearData() {
    if (!confirm('Clear all reports, feedback, saved pages, and settings? This cannot be undone.')) return;
    await sendOptionsRequest<void>({ type: 'CLEAR_DATA' });
    setSettings(fallback);
    setStatus('All local data cleared.');
  }

  return (
    <main className="options-shell stack">
      <header>
        <p className="eyebrow">Regret Browser</p>
        <h1>Settings</h1>
        <p className="quiet">Tune the forecast and manage the data stored locally in Chrome.</p>
      </header>
      {loading ? <div className="status">Loading settings…</div> : (
        <>
          <section className="surface setting-row">
            <div>
              <h2>On-page badge</h2>
              <p className="muted">Show a small risk score after a supported page is analyzed.</p>
            </div>
            <label className="switch">
              <span className="sr-only">Enable on-page badge</span>
              <input type="checkbox" checked={settings.badgeEnabled} onChange={(event) => void update({ badgeEnabled: event.target.checked })} />
              <span aria-hidden="true" />
            </label>
          </section>

          <section className="surface setting-row">
            <div>
              <h2>Sensitivity</h2>
              <p className="muted">Higher sensitivity flags weaker warning signs more readily.</p>
            </div>
            <select value={settings.sensitivity} aria-label="Analysis sensitivity" onChange={(event) => void update({ sensitivity: event.target.value as Sensitivity })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </section>

          <section className="surface stack">
            <div>
              <h2>Hidden domains</h2>
              <p className="muted">The on-page badge will not appear on these sites.</p>
            </div>
            <div className="row">
              <input className="domain-input" value={domain} placeholder="example.com" aria-label="Domain to hide" onChange={(event) => setDomain(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addDomain(); }} />
              <button onClick={addDomain}>Add</button>
            </div>
            {settings.hiddenDomains.length === 0
              ? <EmptyState title="No hidden domains" detail="The badge can appear on all supported sites." />
              : <ul className="domain-list">
                  {settings.hiddenDomains.map((item) => (
                    <li key={item}><span>{item}</span><button aria-label={`Remove ${item}`} onClick={() => void update({ hiddenDomains: settings.hiddenDomains.filter((value) => value !== item) })}>Remove</button></li>
                  ))}
                </ul>}
          </section>

          <section className="surface stack">
            <div>
              <h2>Your local data</h2>
              <p className="muted">Export a portable JSON backup, restore one, or erase everything.</p>
            </div>
            <div className="row wrap">
              <button onClick={() => void exportData()}>Export data</button>
              <button onClick={() => importRef.current?.click()}>Import data</button>
              <input ref={importRef} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importData(file); }} />
              <button className="danger" onClick={() => void clearData()}>Clear all data</button>
            </div>
          </section>
        </>
      )}
      <div className="save-status" aria-live="polite">{status}</div>
    </main>
  );
}
