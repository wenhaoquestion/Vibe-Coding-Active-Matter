import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, FileText, Network, Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { ControlPanel } from "./components/ControlPanel";
import { MetricsPanel } from "./components/MetricsPanel";
import { SimulationCanvas } from "./components/SimulationCanvas";
import { Toolbar } from "./components/Toolbar";
import { defaultToggles } from "./state/presets";
import type { Metrics, PanelTab, ParamKey, PresetName, SimulatorBackend, ToolMode, VisualToggles } from "./state/types";
import { createPhysarumEngine } from "./wasm/physarum";

export default function App() {
  const [engine, setEngine] = useState<SimulatorBackend | null>(null);
  const [running, setRunning] = useState(true);
  const [tool, setTool] = useState<ToolMode>("food");
  const [tab, setTab] = useState<PanelTab>("sim");
  const [toggles, setToggles] = useState<VisualToggles>(defaultToggles);
  const [seed, setSeed] = useState(19);
  const [brushCount, setBrushCount] = useState(180);
  const [version, setVersion] = useState(0);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const frameRef = useRef<number | null>(null);
  const fpsRef = useRef({ last: performance.now(), frames: 0, stepFrames: 0 });

  useEffect(() => {
    let cancelled = false;
    void createPhysarumEngine(240, 160, seed).then((created) => {
      if (cancelled) return;
      setEngine(created);
      setMetrics(created.metrics);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!engine) return undefined;
    const loop = (time: number) => {
      if (running) {
        engine.step(1);
        fpsRef.current.stepFrames += 1;
      }
      fpsRef.current.frames += 1;
      if (time - fpsRef.current.last > 500) {
        const dt = (time - fpsRef.current.last) / 1000;
        engine.metrics.fps = fpsRef.current.frames / dt;
        engine.metrics.stepsPerSecond = fpsRef.current.stepFrames / dt;
        fpsRef.current.last = time;
        fpsRef.current.frames = 0;
        fpsRef.current.stepFrames = 0;
        setMetrics({ ...engine.metrics });
      }
      setVersion((value) => value + 1);
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [engine, running]);

  const backendLabel = useMemo(() => {
    if (!engine) return "loading";
    return engine.metrics.backendCode === 1 ? "C++ WASM" : engine.backendName;
  }, [engine, metrics?.backendCode]);

  const setParam = (key: ParamKey, value: number) => {
    if (!engine) return;
    engine.setParam(key, value);
    setMetrics({ ...engine.metrics });
    setVersion((current) => current + 1);
  };

  const applyPreset = (name: PresetName) => {
    if (!engine) return;
    engine.applyPreset(name);
    setMetrics({ ...engine.metrics });
    setVersion((current) => current + 1);
  };

  const reset = () => {
    if (!engine) return;
    const nextSeed = seed + 1;
    setSeed(nextSeed);
    engine.reset(nextSeed);
    setMetrics({ ...engine.metrics });
    setVersion((current) => current + 1);
  };

  const singleStep = () => {
    if (!engine) return;
    engine.step(1);
    setMetrics({ ...engine.metrics });
    setVersion((current) => current + 1);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Activity size={18} />
          </div>
          <div>
            <h1>Physarum Lab</h1>
            <span>{backendLabel} · seed {seed}</span>
          </div>
        </div>
        <div className="run-controls" aria-label="Simulation controls">
          <button className="control-button primary" onClick={() => setRunning((value) => !value)}>
            {running ? <Pause size={16} /> : <Play size={16} />}
            <span>{running ? "Pause" : "Play"}</span>
          </button>
          <button className="control-button" onClick={singleStep}>
            <StepForward size={16} />
            <span>Step</span>
          </button>
          <button className="control-button" onClick={reset}>
            <RotateCcw size={16} />
            <span>Reset</span>
          </button>
        </div>
        <div className="top-tabs" aria-label="Panel tabs">
          <button className={tab === "network" ? "active" : ""} onClick={() => setTab("network")}>
            <Network size={15} /> Network
          </button>
          <button className={tab === "formula" ? "active" : ""} onClick={() => setTab("formula")}>
            <FileText size={15} /> Formula
          </button>
        </div>
      </header>

      <section className="workspace">
        <Toolbar activeTool={tool} onToolChange={setTool} />
        <div className="canvas-column">
          {engine ? (
            <SimulationCanvas
              engine={engine}
              tool={tool}
              toggles={toggles}
              brushCount={brushCount}
              version={version}
              onMutate={() => {
                setMetrics({ ...engine.metrics });
                setVersion((current) => current + 1);
              }}
            />
          ) : (
            <div className="loading-canvas">Loading simulation...</div>
          )}
          <MetricsPanel metrics={metrics} />
        </div>
        {engine ? (
          <ControlPanel
            params={engine.params}
            tab={tab}
            onTabChange={setTab}
            onParamChange={setParam}
            toggles={toggles}
            onToggleChange={setToggles}
            brushCount={brushCount}
            onBrushCountChange={setBrushCount}
            onPreset={applyPreset}
          />
        ) : null}
      </section>
    </main>
  );
}
