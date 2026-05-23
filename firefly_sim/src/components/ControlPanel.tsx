import { presets } from '../state/presets';
import type { FlashMode, SimParams } from '../state/types';

interface ControlPanelProps {
  params: SimParams;
  seed: number;
  onParamsChange: (params: SimParams) => void;
  onSeedChange: (seed: number) => void;
  onPreset: (name: string) => void;
  onClearObstacles: () => void;
  onClearCityLights: () => void;
  onClearBats: () => void;
}

function NumberSlider({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="control-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <output>{value.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 1)}</output>
    </label>
  );
}

export function ControlPanel({ params, seed, onParamsChange, onSeedChange, onPreset, onClearObstacles, onClearCityLights, onClearBats }: ControlPanelProps) {
  const update = <K extends keyof SimParams>(key: K, value: SimParams[K]) => onParamsChange({ ...params, [key]: value });

  return (
    <section className="panel controls">
      <div className="panel-title">Controls</div>
      <label className="control-row">
        <span>Preset</span>
        <select onChange={(event) => onPreset(event.target.value)} defaultValue="">
          <option value="" disabled>Select experiment</option>
          {Object.keys(presets).map((name) => <option key={name}>{name}</option>)}
        </select>
      </label>
      <label className="control-row">
        <span>Seed</span>
        <input type="number" value={seed} onChange={(event) => onSeedChange(Number(event.target.value) || 1)} />
      </label>
      <NumberSlider label="N" value={params.N} min={25} max={1000} step={25} onChange={(value) => update('N', value)} />
      <NumberSlider label="K" value={params.K} min={0} max={6} step={0.05} onChange={(value) => update('K', value)} />
      <NumberSlider label="R_visual" value={params.R_visual} min={0.3} max={8} step={0.05} onChange={(value) => update('R_visual', value)} />
      <NumberSlider label="D" value={params.D} min={0} max={0.25} step={0.005} onChange={(value) => update('D', value)} />
      <NumberSlider label="omega0" value={params.omega0} min={0.2} max={2.5} step={0.05} onChange={(value) => update('omega0', value)} />
      <NumberSlider label="sigma_omega" value={params.sigma_omega} min={0} max={1.5} step={0.05} onChange={(value) => update('sigma_omega', value)} />
      <NumberSlider label="dt" value={params.dt} min={0.002} max={0.04} step={0.001} onChange={(value) => update('dt', value)} />
      <NumberSlider label="speed" value={params.speed} min={1} max={30} step={1} onChange={(value) => update('speed', value)} />
      <label className="control-row">
        <span>Flash</span>
        <select value={params.flashMode} onChange={(event) => update('flashMode', event.target.value as FlashMode)}>
          <option value="spike">spike</option>
          <option value="cosine">cosine</option>
          <option value="binary">binary</option>
        </select>
      </label>
      <NumberSlider label="sigma_flash" value={params.sigma_flash} min={0.05} max={0.8} step={0.01} onChange={(value) => update('sigma_flash', value)} />

      <div className="subhead">City Light</div>
      <NumberSlider label="epsilon_city" value={params.epsilon_city} min={0} max={2.5} step={0.05} onChange={(value) => update('epsilon_city', value)} />
      <NumberSlider label="Omega_city" value={params.Omega_city} min={0.2} max={2.5} step={0.05} onChange={(value) => update('Omega_city', value)} />
      <button onClick={onClearCityLights}>Clear city lights</button>

      <div className="subhead">Obstacles and Species</div>
      <NumberSlider label="obstacle radius" value={params.obstacleRadius} min={0.1} max={2.0} step={0.05} onChange={(value) => update('obstacleRadius', value)} />
      <label className="checkbox-row">
        <input type="checkbox" checked={params.blockVisibility} onChange={(event) => update('blockVisibility', event.target.checked)} />
        Block visibility
      </label>
      <button onClick={onClearObstacles}>Clear obstacles</button>
      <label className="control-row">
        <span>Species</span>
        <select value={params.speciesMode} onChange={(event) => update('speciesMode', Number(event.target.value) as 1 | 2)}>
          <option value={1}>one species</option>
          <option value={2}>two species</option>
        </select>
      </label>
      {params.speciesMode === 2 && (
        <>
          <NumberSlider label="omega_A" value={params.omega_A} min={0.2} max={2.0} step={0.05} onChange={(value) => update('omega_A', value)} />
          <NumberSlider label="omega_B" value={params.omega_B} min={0.2} max={2.0} step={0.05} onChange={(value) => update('omega_B', value)} />
          <NumberSlider label="K_in" value={params.K_in} min={0} max={6} step={0.05} onChange={(value) => update('K_in', value)} />
          <NumberSlider label="K_out" value={params.K_out} min={0} max={6} step={0.05} onChange={(value) => update('K_out', value)} />
        </>
      )}

      <div className="subhead">Mobility</div>
      <label className="checkbox-row">
        <input type="checkbox" checked={params.mobilityEnabled} onChange={(event) => update('mobilityEnabled', event.target.checked)} />
        Move fireflies
      </label>
      <NumberSlider label="move prob" value={params.moveProbability} min={0} max={1} step={0.01} onChange={(value) => update('moveProbability', value)} />
      <NumberSlider label="v_firefly" value={params.v_firefly} min={0} max={1.2} step={0.02} onChange={(value) => update('v_firefly', value)} />
      <NumberSlider label="D_turn" value={params.D_turn} min={0} max={2} step={0.05} onChange={(value) => update('D_turn', value)} />
      <NumberSlider label="D_move" value={params.D_move} min={0} max={0.2} step={0.005} onChange={(value) => update('D_move', value)} />

      <div className="subhead">Bats</div>
      <label className="checkbox-row">
        <input type="checkbox" checked={params.predationEnabled} onChange={(event) => update('predationEnabled', event.target.checked)} />
        Capture fireflies
      </label>
      <NumberSlider label="bat count" value={params.batCount} min={0} max={12} step={1} onChange={(value) => update('batCount', value)} />
      <NumberSlider label="v_bat" value={params.v_bat} min={0} max={2.5} step={0.05} onChange={(value) => update('v_bat', value)} />
      <NumberSlider label="R_perception" value={params.R_bat_perception} min={0.3} max={6} step={0.05} onChange={(value) => update('R_bat_perception', value)} />
      <NumberSlider label="R_capture" value={params.R_capture} min={0.03} max={0.8} step={0.01} onChange={(value) => update('R_capture', value)} />
      <NumberSlider label="R_avoid" value={params.R_avoid} min={0.1} max={4} step={0.05} onChange={(value) => update('R_avoid', value)} />
      <NumberSlider label="chi_bat" value={params.chi_bat} min={0} max={4} step={0.05} onChange={(value) => update('chi_bat', value)} />
      <NumberSlider label="bat noise" value={params.batTurnNoise} min={0} max={2} step={0.05} onChange={(value) => update('batTurnNoise', value)} />
      <NumberSlider label="softmax T" value={params.batSoftmaxTemperature} min={0.05} max={2} step={0.05} onChange={(value) => update('batSoftmaxTemperature', value)} />
      <NumberSlider label="top-k" value={params.batTopK} min={1} max={8} step={1} onChange={(value) => update('batTopK', value)} />
      <NumberSlider label="decision min" value={params.batDecisionMin} min={0.05} max={2} step={0.05} onChange={(value) => update('batDecisionMin', value)} />
      <NumberSlider label="decision max" value={params.batDecisionMax} min={0.05} max={3} step={0.05} onChange={(value) => update('batDecisionMax', value)} />
      <NumberSlider label="bat sep R" value={params.batSeparationRadius} min={0.05} max={2} step={0.05} onChange={(value) => update('batSeparationRadius', value)} />
      <NumberSlider label="bat sep" value={params.batSeparationStrength} min={0} max={3} step={0.05} onChange={(value) => update('batSeparationStrength', value)} />
      <NumberSlider label="chase noise" value={params.batChaseNoise} min={0} max={1} step={0.02} onChange={(value) => update('batChaseNoise', value)} />
      <button onClick={onClearBats}>Clear bats</button>
    </section>
  );
}
