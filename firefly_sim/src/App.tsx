import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { DiagnosticPanel } from './components/DiagnosticPanel';
import { FormulaPanel } from './components/FormulaPanel';
import { MetricsPanel } from './components/MetricsPanel';
import { ScanPanel } from './components/ScanPanel';
import { SimulationCanvas } from './components/SimulationCanvas';
import { Toolbar } from './components/Toolbar';
import { defaultParams, presets } from './state/presets';
import type { FireflyAdapter, ScanKind, SimParams, SimSnapshot, ToolMode } from './state/types';
import { logDiagnostic, summarizeParams, summarizeSnapshot } from './state/diagnostics';
import { createFireflyAdapter } from './wasm/firefly';

export default function App() {
  const [params, setParams] = useState<SimParams>(defaultParams);
  const paramsRef = useRef(params);
  const [seed, setSeed] = useState(42);
  const [paused, setPaused] = useState(false);
  const [tool, setTool] = useState<ToolMode>('inspect');
  const [snapshot, setSnapshot] = useState<SimSnapshot | null>(null);
  const snapshotRef = useRef<SimSnapshot | null>(null);
  const [adapter, setAdapter] = useState<FireflyAdapter | null>(null);
  const [showEdges, setShowEdges] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showPhase, setShowPhase] = useState(true);
  const [fps, setFps] = useState(0);
  const [stepsPerSecond, setStepsPerSecond] = useState(0);
  const frameStats = useRef({ last: performance.now(), frames: 0, steps: 0 });
  const snapshotStats = useRef({ last: 0 });

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const syncSnapshotFromAdapter = useCallback((syncCounts = false) => {
    if (!adapter) return;
    let nextSnapshot: SimSnapshot;
    try {
      nextSnapshot = adapter.getSnapshot();
    } catch (error) {
      logDiagnostic('error', 'Failed to read simulation snapshot', {
        error,
        params: summarizeParams(paramsRef.current),
        lastSnapshot: summarizeSnapshot(snapshotRef.current)
      });
      setPaused(true);
      return;
    }
    snapshotRef.current = nextSnapshot;
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
    if (!adapter) return;
    try {
      adapter.setParams(params);
      const nextSnapshot = adapter.getSnapshot();
      snapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
    } catch (error) {
      logDiagnostic('error', 'Failed to apply simulation params', {
        error,
        params: summarizeParams(params),
        lastSnapshot: summarizeSnapshot(snapshotRef.current)
      });
      setPaused(true);
    }
  }, [adapter, params]);

  useEffect(() => {
    let cancelled = false;
    createFireflyAdapter(defaultParams)
      .then(async (created) => {
        if (cancelled) return;
        await created.init(1000, 700, seed, defaultParams);
        const initialSnapshot = created.getSnapshot();
        snapshotRef.current = initialSnapshot;
        logDiagnostic('info', 'Simulation adapter initialized', {
          mode: created.mode,
          params: summarizeParams(defaultParams),
          snapshot: summarizeSnapshot(initialSnapshot)
        });
        setAdapter(created);
        setSnapshot(initialSnapshot);
      })
      .catch((error) => {
        logDiagnostic('error', 'Failed to initialize simulation adapter', error);
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
      try {
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
        const snapshotInterval = paused ? 500 : 100;
        if (now - snapshotStats.current.last >= snapshotInterval) {
          const nextSnapshot = adapter.getSnapshot();
          snapshotRef.current = nextSnapshot;
          setSnapshot(nextSnapshot);
          snapshotStats.current.last = now;
        }
      } catch (error) {
        logDiagnostic('error', 'Simulation loop crashed', {
          error,
          params: summarizeParams(paramsRef.current),
          lastSnapshot: summarizeSnapshot(snapshotRef.current),
          paused,
          adapterMode: adapter.mode
        });
        setPaused(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [adapter, paused]);

  const reset = useCallback(() => {
    try {
      adapter?.reset(seed, paramsRef.current);
      logDiagnostic('info', 'Reset simulation', { seed, params: summarizeParams(paramsRef.current) });
      syncSnapshotFromAdapter();
    } catch (error) {
      logDiagnostic('error', 'Reset failed', { error, seed, params: summarizeParams(paramsRef.current) });
      setPaused(true);
    }
  }, [adapter, seed, syncSnapshotFromAdapter]);

  const applyPreset = (name: string) => {
    const next = { ...paramsRef.current, ...presets[name] };
    try {
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
      logDiagnostic('info', `Applied preset: ${name}`, summarizeParams(next));
    } catch (error) {
      logDiagnostic('error', `Preset failed: ${name}`, { error, params: summarizeParams(next) });
      setPaused(true);
    }
  };

  const addCityLight = (x: number, y: number) => {
    try {
      adapter?.addCityLight(x, y, params.L * 0.25, params.epsilon_city || 1, params.Omega_city);
      logDiagnostic('info', 'Added city light', { x, y });
      syncSnapshotFromAdapter(true);
    } catch (error) {
      logDiagnostic('error', 'Add city light failed', { error, x, y });
      setPaused(true);
    }
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
            try {
              adapter?.clearObstacles();
              logDiagnostic('info', 'Cleared obstacles');
              syncSnapshotFromAdapter();
            } catch (error) {
              logDiagnostic('error', 'Clear obstacles failed', error);
              setPaused(true);
            }
          }}
          onClearCityLights={() => {
            try {
              adapter?.clearCityLights();
              logDiagnostic('info', 'Cleared city lights');
              syncSnapshotFromAdapter();
            } catch (error) {
              logDiagnostic('error', 'Clear city lights failed', error);
              setPaused(true);
            }
          }}
          onClearBats={() => {
            try {
              adapter?.clearBats();
              logDiagnostic('info', 'Cleared bats');
              syncSnapshotFromAdapter(true);
            } catch (error) {
              logDiagnostic('error', 'Clear bats failed', error);
              setPaused(true);
            }
          }}
        />
        <MetricsPanel snapshot={snapshot} fps={fps} stepsPerSecond={stepsPerSecond} />
        <ScanPanel
          snapshot={snapshot}
          onRunScan={(kind: ScanKind, min, max, samples, steps, burnIn, threshold) => {
            try {
              const results = adapter?.runScan(kind, min, max, samples, steps, burnIn, threshold);
              logDiagnostic('info', `Ran ${kind} scan`, {
                min,
                max,
                samples,
                resultCount: results?.length ?? 0,
                params: summarizeParams(paramsRef.current)
              });
              syncSnapshotFromAdapter();
            } catch (error) {
              logDiagnostic('error', `Scan failed: ${kind}`, { error, min, max, samples });
              setPaused(true);
            }
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
          try {
            adapter?.step(1);
            logDiagnostic('info', 'Manual step');
            syncSnapshotFromAdapter();
          } catch (error) {
            logDiagnostic('error', 'Manual step failed', { error, params: summarizeParams(paramsRef.current) });
            setPaused(true);
          }
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
              try {
                adapter?.addFireflies(x, y, count, radius);
                logDiagnostic('info', 'Added fireflies', { x, y, count, radius });
                syncSnapshotFromAdapter(true);
              } catch (error) {
                logDiagnostic('error', 'Add fireflies failed', { error, x, y, count, radius });
                setPaused(true);
              }
            }}
            onEraseObjects={(x, y, radius) => {
              try {
                adapter?.eraseFireflies(x, y, radius);
                adapter?.eraseObstacles(x, y, radius);
                adapter?.eraseCityLights(x, y, radius);
                adapter?.eraseBats(x, y, radius);
                logDiagnostic('info', 'Erased objects', { x, y, radius });
                syncSnapshotFromAdapter(true);
              } catch (error) {
                logDiagnostic('error', 'Erase objects failed', { error, x, y, radius });
                setPaused(true);
              }
            }}
            onAddObstacle={(x, y, radius) => {
              try {
                adapter?.addObstacle(x, y, radius);
                logDiagnostic('info', 'Added obstacle', { x, y, radius });
                syncSnapshotFromAdapter();
              } catch (error) {
                logDiagnostic('error', 'Add obstacle failed', { error, x, y, radius });
                setPaused(true);
              }
            }}
            onAddCityLight={addCityLight}
            onAddBat={(x, y) => {
              try {
                adapter?.addBat(x, y);
                logDiagnostic('info', 'Added bat', { x, y });
                syncSnapshotFromAdapter(true);
              } catch (error) {
                logDiagnostic('error', 'Add bat failed', { error, x, y });
                setPaused(true);
              }
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
      <DiagnosticPanel />
    </main>
  );
}
