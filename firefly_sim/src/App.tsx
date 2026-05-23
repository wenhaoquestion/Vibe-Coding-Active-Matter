import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { FormulaPanel } from './components/FormulaPanel';
import { MetricsPanel } from './components/MetricsPanel';
import { ScanPanel } from './components/ScanPanel';
import { SimulationCanvas } from './components/SimulationCanvas';
import { Toolbar } from './components/Toolbar';
import { defaultParams, presets } from './state/presets';
import type { FireflyAdapter, ScanKind, SimParams, SimSnapshot, ToolMode } from './state/types';
import { createFireflyAdapter } from './wasm/firefly';

export default function App() {
  const [params, setParams] = useState<SimParams>(defaultParams);
  const paramsRef = useRef(params);
  const [seed, setSeed] = useState(42);
  const [paused, setPaused] = useState(false);
  const [tool, setTool] = useState<ToolMode>('inspect');
  const [snapshot, setSnapshot] = useState<SimSnapshot | null>(null);
  const [adapter, setAdapter] = useState<FireflyAdapter | null>(null);
  const [showEdges, setShowEdges] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showPhase, setShowPhase] = useState(true);
  const [fps, setFps] = useState(0);
  const [stepsPerSecond, setStepsPerSecond] = useState(0);
  const frameStats = useRef({ last: performance.now(), frames: 0, steps: 0 });

  const syncSnapshotFromAdapter = useCallback((syncCounts = false) => {
    if (!adapter) return;
    const nextSnapshot = adapter.getSnapshot();
    setSnapshot(nextSnapshot);
    if (!syncCounts) return;
    setParams((current) => {
      const nextN = nextSnapshot.fireflies.length;
      const nextBatCount = nextSnapshot.bats.length;
      if (current.N === nextN && current.batCount === nextBatCount) return current;
      const updated = { ...current, N: nextN, batCount: nextBatCount };
      paramsRef.current = updated;
      return updated;
    });
  }, [adapter]);

  useEffect(() => {
    paramsRef.current = params;
    adapter?.setParams(params);
    if (adapter) setSnapshot(adapter.getSnapshot());
  }, [adapter, params]);

  useEffect(() => {
    let cancelled = false;
    createFireflyAdapter(defaultParams).then(async (created) => {
      if (cancelled) return;
      await created.init(1000, 700, seed, defaultParams);
      setAdapter(created);
      setSnapshot(created.getSnapshot());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!adapter) return;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      if (!paused) {
        const steps = Math.max(1, Math.floor(paramsRef.current.speed));
        adapter.step(steps);
        frameStats.current.steps += steps;
      }
      frameStats.current.frames += 1;
      if (now - frameStats.current.last > 600) {
        const elapsed = (now - frameStats.current.last) / 1000;
        setFps(frameStats.current.frames / elapsed);
        setStepsPerSecond(frameStats.current.steps / elapsed);
        frameStats.current = { last: now, frames: 0, steps: 0 };
      }
      setSnapshot(adapter.getSnapshot());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [adapter, paused]);

  const reset = useCallback(() => {
    adapter?.reset(seed, paramsRef.current);
    syncSnapshotFromAdapter();
  }, [adapter, seed, syncSnapshotFromAdapter]);

  const applyPreset = (name: string) => {
    const next = { ...paramsRef.current, ...presets[name] };
    setParams(next);
    if (name === 'Forest Barriers' && adapter) {
      adapter.clearObstacles();
      adapter.addObstacle(next.L * 0.36, next.L * 0.48, next.obstacleRadius);
      adapter.addObstacle(next.L * 0.62, next.L * 0.53, next.obstacleRadius * 1.2);
    }
    if (name === 'City Light' && adapter) {
      adapter.clearCityLights();
      adapter.addCityLight(next.L * 0.78, next.L * 0.28, next.L * 0.35, next.epsilon_city, next.Omega_city);
    }
    if (name === 'Predator Avoidance' && adapter) {
      adapter.clearBats();
      for (let i = 0; i < (next.batCount ?? 0); i += 1) {
        adapter.addBat(next.L * (0.25 + 0.2 * i), next.L * (0.25 + 0.16 * (i % 3)));
      }
    }
  };

  const addCityLight = (x: number, y: number) => {
    adapter?.addCityLight(x, y, params.L * 0.25, params.epsilon_city || 1, params.Omega_city);
    syncSnapshotFromAdapter(true);
  };

  const controls = useMemo(
    () => (
      <>
        <ControlPanel
          params={params}
          seed={seed}
          onParamsChange={setParams}
          onSeedChange={setSeed}
          onPreset={applyPreset}
          onClearObstacles={() => {
            adapter?.clearObstacles();
            syncSnapshotFromAdapter();
          }}
          onClearCityLights={() => {
            adapter?.clearCityLights();
            syncSnapshotFromAdapter();
          }}
          onClearBats={() => {
            adapter?.clearBats();
            syncSnapshotFromAdapter(true);
          }}
        />
        <MetricsPanel snapshot={snapshot} fps={fps} stepsPerSecond={stepsPerSecond} />
        <ScanPanel
          snapshot={snapshot}
          onRunScan={(kind: ScanKind, min, max, samples, steps, burnIn, threshold) => {
            adapter?.runScan(kind, min, max, samples, steps, burnIn, threshold);
            syncSnapshotFromAdapter();
          }}
        />
        <FormulaPanel />
      </>
    ),
    [adapter, fps, params, seed, snapshot, stepsPerSecond, syncSnapshotFromAdapter]
  );

  return (
    <main className="app-shell">
      <header>
        <div>
          <h1>Firefly Synchronization Lab</h1>
          <p>Local phase coupling, visibility, noise, city forcing, and forest obstacles.</p>
        </div>
        <div className={`engine-badge ${snapshot?.mode === 'wasm' ? 'wasm' : 'fallback'}`}>
          Engine: {snapshot?.mode ?? 'loading'}
        </div>
      </header>

      <Toolbar
        tool={tool}
        onToolChange={setTool}
        paused={paused}
        onTogglePaused={() => setPaused((value) => !value)}
        onStep={() => {
          adapter?.step(1);
          syncSnapshotFromAdapter();
        }}
        onReset={reset}
      />

      <section className="workspace">
        <div className="sim-column">
          <SimulationCanvas
            snapshot={snapshot}
            params={params}
            tool={tool}
            showEdges={showEdges}
            showHeatmap={showHeatmap}
            showPhase={showPhase}
            onAddFireflies={(x, y, count, radius) => {
              adapter?.addFireflies(x, y, count, radius);
              syncSnapshotFromAdapter(true);
            }}
            onEraseObjects={(x, y, radius) => {
              adapter?.eraseFireflies(x, y, radius);
              adapter?.eraseObstacles(x, y, radius);
              adapter?.eraseCityLights(x, y, radius);
              adapter?.eraseBats(x, y, radius);
              syncSnapshotFromAdapter(true);
            }}
            onAddObstacle={(x, y, radius) => {
              adapter?.addObstacle(x, y, radius);
              syncSnapshotFromAdapter();
            }}
            onAddCityLight={addCityLight}
            onAddBat={(x, y) => {
              adapter?.addBat(x, y);
              syncSnapshotFromAdapter(true);
            }}
          />
          <div className="toggles">
            <label><input type="checkbox" checked={showPhase} onChange={(event) => setShowPhase(event.target.checked)} /> phase color</label>
            <label><input type="checkbox" checked={showEdges} onChange={(event) => setShowEdges(event.target.checked)} /> neighbor edges</label>
            <label><input type="checkbox" checked={showHeatmap} onChange={(event) => setShowHeatmap(event.target.checked)} /> local heatmap</label>
          </div>
        </div>
        <aside>{controls}</aside>
      </section>
    </main>
  );
}
