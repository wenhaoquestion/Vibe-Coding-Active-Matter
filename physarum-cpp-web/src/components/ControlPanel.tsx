import { ChevronDown, FileText, Network, SlidersHorizontal, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { formulaSnippets, presetLabels } from "../state/presets";
import type { PanelTab, ParamKey, PresetName, SimParams, VisualToggles } from "../state/types";

interface ControlPanelProps {
  params: SimParams;
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onParamChange: (key: ParamKey, value: number) => void;
  toggles: VisualToggles;
  onToggleChange: (toggles: VisualToggles) => void;
  brushCount: number;
  onBrushCountChange: (count: number) => void;
  onPreset: (preset: PresetName) => void;
}

export function ControlPanel({
  params,
  tab,
  onTabChange,
  onParamChange,
  toggles,
  onToggleChange,
  brushCount,
  onBrushCountChange,
  onPreset
}: ControlPanelProps) {
  return (
    <aside className="control-panel">
      <div className="panel-tabs">
        <TabButton active={tab === "sim"} icon={<SlidersHorizontal size={15} />} label="Sim" onClick={() => onTabChange("sim")} />
        <TabButton active={tab === "energy"} icon={<Zap size={15} />} label="Energy" onClick={() => onTabChange("energy")} />
        <TabButton active={tab === "network"} icon={<Network size={15} />} label="Network" onClick={() => onTabChange("network")} />
        <TabButton active={tab === "formula"} icon={<FileText size={15} />} label="Formula" onClick={() => onTabChange("formula")} />
      </div>

      {tab === "sim" ? (
        <section className="panel-section">
          <PanelTitle title="Presets" />
          <div className="preset-grid">
            {(Object.entries(presetLabels) as Array<[PresetName, string]>).map(([key, label]) => (
              <button key={key} onClick={() => onPreset(key)}>{label}</button>
            ))}
          </div>
          <PanelTitle title="Brush" />
          <Range label="Slime count" value={brushCount} min={10} max={1200} step={10} onChange={onBrushCountChange} />
          <Range label="Brush radius" value={params.brushRadius} min={2} max={42} step={1} onChange={(value) => onParamChange("brushRadius", value)} />
          <PanelTitle title="Food" />
          <Range label="Food calories" value={params.foodCalories} min={40} max={1600} step={10} onChange={(value) => onParamChange("foodCalories", value)} />
          <Range label="Food radius" value={params.foodRadius} min={3} max={34} step={1} onChange={(value) => onParamChange("foodRadius", value)} />
          <Range label="Food quality" value={params.foodQuality} min={0.2} max={2.2} step={0.05} onChange={(value) => onParamChange("foodQuality", value)} />
          <PanelTitle title="Motion and trail" />
          <Range label="Speed" value={params.speed} min={0.2} max={3.2} step={0.05} onChange={(value) => onParamChange("speed", value)} />
          <Range label="Sensor distance" value={params.sensorDistance} min={2} max={28} step={0.5} onChange={(value) => onParamChange("sensorDistance", value)} />
          <Range label="Sensor angle" value={params.sensorAngle} min={0.12} max={1.5} step={0.02} onChange={(value) => onParamChange("sensorAngle", value)} />
          <Range label="Turn angle" value={params.turnAngle} min={0.04} max={1.2} step={0.02} onChange={(value) => onParamChange("turnAngle", value)} />
          <Range label="Deposit" value={params.trailDeposit} min={0.05} max={2.4} step={0.05} onChange={(value) => onParamChange("trailDeposit", value)} />
          <Range label="Diffusion" value={params.trailDiffuse} min={0} max={1} step={0.02} onChange={(value) => onParamChange("trailDiffuse", value)} />
          <Range label="Decay" value={params.trailDecay} min={0.002} max={0.14} step={0.002} onChange={(value) => onParamChange("trailDecay", value)} />
        </section>
      ) : null}

      {tab === "energy" ? (
        <section className="panel-section">
          <PanelTitle title="Energy budget" />
          <Range label="Max energy" value={params.maxEnergy} min={20} max={220} step={5} onChange={(value) => onParamChange("maxEnergy", value)} />
          <Range label="Base metabolism" value={params.baseMetabolism} min={0.001} max={0.08} step={0.001} onChange={(value) => onParamChange("baseMetabolism", value)} />
          <Range label="Move cost" value={params.moveCost} min={0.001} max={0.05} step={0.001} onChange={(value) => onParamChange("moveCost", value)} />
          <Range label="Search cost" value={params.searchCost} min={0} max={0.09} step={0.002} onChange={(value) => onParamChange("searchCost", value)} />
          <Range label="Eat rate" value={params.eatRate} min={0.1} max={6} step={0.1} onChange={(value) => onParamChange("eatRate", value)} />
          <Range label="Eat efficiency" value={params.eatEfficiency} min={0.2} max={6} step={0.1} onChange={(value) => onParamChange("eatEfficiency", value)} />
          <PanelTitle title="Growth and death" />
          <Range label="Growth threshold" value={params.growthThreshold} min={0.2} max={0.95} step={0.01} onChange={(value) => onParamChange("growthThreshold", value)} />
          <Range label="Growth rate" value={params.growthRate} min={0} max={0.08} step={0.001} onChange={(value) => onParamChange("growthRate", value)} />
          <Range label="Growth cost" value={params.growthCost} min={0} max={44} step={1} onChange={(value) => onParamChange("growthCost", value)} />
          <Range label="Split mass" value={params.splitMass} min={1.1} max={6} step={0.1} onChange={(value) => onParamChange("splitMass", value)} />
          <Range label="Split energy" value={params.splitEnergy} min={10} max={180} step={2} onChange={(value) => onParamChange("splitEnergy", value)} />
          <Range label="Death delay" value={params.starvationSteps} min={30} max={1200} step={10} onChange={(value) => onParamChange("starvationSteps", value)} />
        </section>
      ) : null}

      {tab === "network" ? (
        <section className="panel-section">
          <PanelTitle title="Overlay" />
          <Toggle label="Trail field" checked={toggles.trail} onChange={(value) => onToggleChange({ ...toggles, trail: value })} />
          <Toggle label="Food attractant" checked={toggles.foodField} onChange={(value) => onToggleChange({ ...toggles, foodField: value })} />
          <Toggle label="Agents" checked={toggles.agents} onChange={(value) => onToggleChange({ ...toggles, agents: value })} />
          <Toggle label="Agent directions" checked={toggles.directions} onChange={(value) => onToggleChange({ ...toggles, directions: value })} />
          <Toggle label="Conductance tubes" checked={toggles.network} onChange={(value) => onToggleChange({ ...toggles, network: value })} />
          <Toggle label="Shortest path" checked={toggles.shortestPath} onChange={(value) => onToggleChange({ ...toggles, shortestPath: value })} />
          <PanelTitle title="Network solver" />
          <Range label="Update interval" value={params.networkInterval} min={3} max={60} step={1} onChange={(value) => onParamChange("networkInterval", value)} />
          <p className="panel-note">Graph nodes are sampled from food sources and trail ridges. Edges decay unless reinforced by current nutrient paths.</p>
        </section>
      ) : null}

      {tab === "formula" ? (
        <section className="panel-section formula-list">
          <PanelTitle title="Model equations" />
          {formulaSnippets.map((item) => (
            <article className="formula-item" key={item.label}>
              <span>{item.label}</span>
              <code>{item.tex}</code>
            </article>
          ))}
          <p className="panel-note">Full derivation lives in <code>docs/model.tex</code>. The UI variables match the implementation parameters where practical.</p>
        </section>
      ) : null}
    </aside>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function PanelTitle({ title }: { title: string }) {
  return (
    <h2 className="panel-title">
      {title}
      <ChevronDown size={14} />
    </h2>
  );
}

function Range({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="range-row">
      <span>{label}</span>
      <input value={value} min={min} max={max} step={step} type="range" onChange={(event) => onChange(Number(event.target.value))} />
      <output>{formatValue(value)}</output>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function formatValue(value: number) {
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
