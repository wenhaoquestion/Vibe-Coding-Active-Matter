import type { Metrics } from "../state/types";

interface MetricsPanelProps {
  metrics: Metrics | null;
}

const format = (value: number, digits = 0) => {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
};

export function MetricsPanel({ metrics }: MetricsPanelProps) {
  const m = metrics;
  return (
    <aside className="metrics-panel" aria-label="Simulation metrics">
      <Metric label="Alive agents" value={format(m?.alive ?? 0)} />
      <Metric label="Avg energy" value={format(m?.avgEnergy ?? 0, 1)} />
      <Metric label="Biomass" value={format(m?.totalBiomass ?? 0, 1)} />
      <Metric label="Food remaining" value={format(m?.foodRemaining ?? 0, 0)} />
      <Metric label="Path length" value={format(m?.pathLength ?? 0, 1)} />
      <Metric label="Dissipation" value={format(m?.dissipation ?? 0, 1)} />
      <Metric label="FPS" value={format(m?.fps ?? 0, 0)} />
      <Metric label="Steps/s" value={format(m?.stepsPerSecond ?? 0, 0)} />
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
