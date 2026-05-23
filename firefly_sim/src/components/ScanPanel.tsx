import { useState } from 'react';
import type { ScanKind, SimSnapshot } from '../state/types';
import { PhasePlot } from './PhasePlot';

interface ScanPanelProps {
  snapshot: SimSnapshot | null;
  onRunScan: (kind: ScanKind, min: number, max: number, samples: number, steps: number, burnIn: number, threshold: number) => void;
}

export function ScanPanel({ snapshot, onRunScan }: ScanPanelProps) {
  const [kind, setKind] = useState<ScanKind>('K');
  const [samples, setSamples] = useState(9);
  const [threshold, setThreshold] = useState(0.5);
  const defaults = kind === 'K' ? [0, 5] : kind === 'R_visual' ? [0.5, 5] : kind === 'D' ? [0, 0.2] : kind === 'chi_bat' ? [0, 4] : [0, 8];
  const [min, setMin] = useState(defaults[0]);
  const [max, setMax] = useState(defaults[1]);

  const changeKind = (value: ScanKind) => {
    setKind(value);
    const next = value === 'K' ? [0, 5] : value === 'R_visual' ? [0.5, 5] : value === 'D' ? [0, 0.2] : value === 'chi_bat' ? [0, 4] : [0, 8];
    setMin(next[0]);
    setMax(next[1]);
  };

  return (
    <section className="panel">
      <div className="panel-title">Parameter Scan</div>
      <div className="scan-grid">
        <label>scan <select value={kind} onChange={(event) => changeKind(event.target.value as ScanKind)}><option value="K">K</option><option value="R_visual">R_visual</option><option value="D">D</option><option value="chi_bat">chi_bat</option><option value="batCount">batCount</option></select></label>
        <label>min <input type="number" value={min} step="0.1" onChange={(event) => setMin(Number(event.target.value))} /></label>
        <label>max <input type="number" value={max} step="0.1" onChange={(event) => setMax(Number(event.target.value))} /></label>
        <label>samples <input type="number" value={samples} min={3} max={25} onChange={(event) => setSamples(Number(event.target.value))} /></label>
        <label>threshold <input type="number" value={threshold} min={0} max={1} step={0.05} onChange={(event) => setThreshold(Number(event.target.value))} /></label>
      </div>
      <button className="primary" onClick={() => onRunScan(kind, min, max, samples, 450, 180, threshold)}>Run scan</button>
      <div className="scan-result">estimated Kc: {snapshot?.estimatedKc == null ? 'not found' : snapshot.estimatedKc.toFixed(3)}</div>
      <PhasePlot scan={snapshot?.scanResults ?? []} />
    </section>
  );
}
