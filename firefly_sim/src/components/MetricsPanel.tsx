import type { SimSnapshot } from '../state/types';
import { PhasePlot } from './PhasePlot';

interface MetricsPanelProps {
  snapshot: SimSnapshot | null;
  fps: number;
  stepsPerSecond: number;
}

export function MetricsPanel({ snapshot, fps, stepsPerSecond }: MetricsPanelProps) {
  const metrics = snapshot?.metrics;
  return (
    <section className="panel">
      <div className="panel-title">Metrics</div>
      <div className="metric-grid">
        <div><span>r(t)</span><strong>{metrics?.r.toFixed(3) ?? '-'}</strong></div>
        <div><span>local r</span><strong>{metrics?.rLocalMean.toFixed(3) ?? '-'}</strong></div>
        <div><span>avg k</span><strong>{metrics?.avgNeighbors.toFixed(1) ?? '-'}</strong></div>
        <div><span>isolated</span><strong>{metrics?.isolatedCount.toFixed(0) ?? '-'}</strong></div>
        <div><span>Delta_lock</span><strong>{metrics?.cityLockDelta.toFixed(3) ?? '-'}</strong></div>
        <div><span>FPS</span><strong>{fps.toFixed(0)}</strong></div>
        <div><span>steps/s</span><strong>{stepsPerSecond.toFixed(0)}</strong></div>
        <div><span>rA / rB</span><strong>{metrics ? `${metrics.rA.toFixed(2)} / ${metrics.rB.toFixed(2)}` : '-'}</strong></div>
        <div><span>alive / captured</span><strong>{metrics ? `${metrics.aliveCount.toFixed(0)} / ${metrics.capturedCount.toFixed(0)}` : '-'}</strong></div>
        <div><span>mean panic</span><strong>{metrics?.meanPanic.toFixed(3) ?? '-'}</strong></div>
        <div><span>nearest bat</span><strong>{metrics?.meanNearestBatDistance.toFixed(2) ?? '-'}</strong></div>
        <div><span>bat targets</span><strong>{metrics?.batTargetCount.toFixed(0) ?? '-'}</strong></div>
      </div>
      <div className="plot-title">r(t)</div>
      <PhasePlot history={snapshot?.timeSeries ?? []} metric="r" />
      <div className="plot-title">local order</div>
      <PhasePlot history={snapshot?.timeSeries ?? []} metric="rLocalMean" />
    </section>
  );
}
