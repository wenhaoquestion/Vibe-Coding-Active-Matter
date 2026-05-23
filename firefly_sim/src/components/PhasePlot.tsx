import type { Metrics, ScanPoint } from '../state/types';

interface PhasePlotProps {
  history?: Metrics[];
  scan?: ScanPoint[];
  metric?: 'r' | 'rLocalMean';
}

export function PhasePlot({ history = [], scan = [], metric = 'r' }: PhasePlotProps) {
  const width = 320;
  const height = 110;
  const points = scan.length
    ? scan.map((p, i) => ({ x: (i / Math.max(1, scan.length - 1)) * width, y: height - p.rBar * height }))
    : history.map((m, i) => ({ x: (i / Math.max(1, history.length - 1)) * width, y: height - m[metric] * height }));
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return (
    <svg className="plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={scan.length ? 'scan plot' : 'order parameter time series'}>
      <line x1="0" y1={height - 1} x2={width} y2={height - 1} />
      <line x1="1" y1="0" x2="1" y2={height} />
      <path d={d} />
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={scan.length ? 2.8 : 1.2} />)}
    </svg>
  );
}
