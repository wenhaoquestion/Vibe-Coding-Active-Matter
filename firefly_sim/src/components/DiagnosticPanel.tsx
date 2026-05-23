import { useEffect, useState } from 'react';
import { clearDiagnostics, type DiagnosticEntry, subscribeDiagnostics } from '../state/diagnostics';

export function DiagnosticPanel() {
  const [entries, setEntries] = useState<DiagnosticEntry[]>([]);
  const [open, setOpen] = useState(false);
  const hasErrors = entries.some((entry) => entry.level === 'error');

  useEffect(() => subscribeDiagnostics(setEntries), []);

  return (
    <section className={`diagnostics ${open ? 'open' : ''} ${hasErrors ? 'has-error' : ''}`}>
      <button className="diagnostics-toggle" onClick={() => setOpen((value) => !value)}>
        Logs {entries.length ? `(${entries.length})` : ''}
      </button>
      {open && (
        <div className="diagnostics-body">
          <div className="diagnostics-actions">
            <span>{hasErrors ? 'Recent crash/error context' : 'Recent simulation events'}</span>
            <button onClick={clearDiagnostics}>Clear</button>
          </div>
          {entries.length === 0 ? (
            <div className="diagnostic-empty">No logs yet.</div>
          ) : (
            entries.map((entry) => (
              <article key={entry.id} className={`diagnostic-entry ${entry.level}`}>
                <div>
                  <strong>{entry.level}</strong>
                  <span>{entry.time}</span>
                </div>
                <p>{entry.message}</p>
                {entry.details && <pre>{entry.details}</pre>}
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}
