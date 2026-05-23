import { useEffect, useRef, useState } from "react";
import type { SimulatorBackend, ToolMode, VisualToggles } from "../state/types";

interface SimulationCanvasProps {
  engine: SimulatorBackend;
  tool: ToolMode;
  toggles: VisualToggles;
  brushCount: number;
  version: number;
  onMutate: () => void;
}

interface HoverInfo {
  x: number;
  y: number;
  text: string;
}

export function SimulationCanvas({ engine, tool, toggles, brushCount, version, onMutate }: SimulationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, rect.width, rect.height);
  }, [engine, toggles, version]);

  const toSim = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      sx: ((event.clientX - rect.left) / rect.width) * engine.width,
      sy: ((event.clientY - rect.top) / rect.height) * engine.height,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const useTool = (sx: number, sy: number, continuous: boolean) => {
    if (tool === "inspect") return;
    if (tool === "food" && continuous) return;
    if (tool === "food") {
      engine.addFood(sx, sy, engine.params.foodCalories, engine.params.foodRadius, engine.params.foodQuality);
    }
    if (tool === "slime") {
      engine.addAgents(sx, sy, continuous ? Math.max(8, Math.round(brushCount * 0.12)) : brushCount, engine.params.brushRadius, engine.params.maxEnergy * 0.82);
    }
    if (tool === "erase") {
      engine.erase(sx, sy, engine.params.brushRadius);
    }
    onMutate();
  };

  const updateHover = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = toSim(event);
    const nearestFood = engine.foods
      .map((food) => ({ food, d: Math.hypot(food.x - point.sx, food.y - point.sy) }))
      .sort((a, b) => a.d - b.d)[0];
    if (nearestFood && nearestFood.d < Math.max(nearestFood.food.radius * 1.4, 9)) {
      setHover({
        x: point.x,
        y: point.y,
        text: `food ${nearestFood.food.calories.toFixed(0)} cal · q ${nearestFood.food.quality.toFixed(2)}`
      });
      return;
    }
    const trailIndex = Math.floor(point.sy) * engine.width + Math.floor(point.sx);
    const signal = (engine.trail[trailIndex] ?? 0) + (engine.foodField[trailIndex] ?? 0);
    setHover({ x: point.x, y: point.y, text: `signal ${signal.toFixed(2)} · ${tool}` });
  };

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#070a0d");
    gradient.addColorStop(0.55, "#0d1114");
    gradient.addColorStop(1, "#050607");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    drawField(ctx, width, height);
    if (toggles.network) drawNetwork(ctx, width, height);
    drawFood(ctx, width, height);
    if (toggles.agents) drawAgents(ctx, width, height);
    drawGrid(ctx, width, height);
  };

  const drawField = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!fieldCanvasRef.current) {
      fieldCanvasRef.current = document.createElement("canvas");
      fieldCanvasRef.current.width = engine.width;
      fieldCanvasRef.current.height = engine.height;
    }
    const fieldCanvas = fieldCanvasRef.current;
    const fieldCtx = fieldCanvas.getContext("2d");
    if (!fieldCtx) return;
    const image = fieldCtx.createImageData(engine.width, engine.height);
    for (let i = 0; i < engine.trail.length; i += 1) {
      const trail = toggles.trail ? 1 - Math.exp(-engine.trail[i] * 0.34) : 0;
      const food = toggles.foodField ? 1 - Math.exp(-engine.foodField[i] * 0.46) : 0;
      const energy = Math.max(trail, food * 0.7);
      image.data[i * 4] = Math.round(food * 236 + trail * 34);
      image.data[i * 4 + 1] = Math.round(trail * 238 + food * 124);
      image.data[i * 4 + 2] = Math.round(trail * 150 + food * 26);
      image.data[i * 4 + 3] = Math.round(Math.min(218, energy * 218));
    }
    fieldCtx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = "screen";
    ctx.drawImage(fieldCanvas, 0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
  };

  const drawNetwork = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const sx = width / engine.width;
    const sy = height / engine.height;
    ctx.save();
    ctx.lineCap = "round";
    for (const edge of engine.network) {
      if (edge.path && !toggles.shortestPath) continue;
      ctx.beginPath();
      ctx.moveTo(edge.ax * sx, edge.ay * sy);
      ctx.lineTo(edge.bx * sx, edge.by * sy);
      ctx.lineWidth = edge.path ? 3.2 : Math.max(0.6, edge.conductance * 2.4);
      ctx.strokeStyle = edge.path ? "rgba(250, 220, 112, 0.94)" : `rgba(88, 229, 198, ${Math.min(0.72, 0.16 + edge.conductance * 0.18)})`;
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawFood = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const sx = width / engine.width;
    const sy = height / engine.height;
    for (const food of engine.foods) {
      const x = food.x * sx;
      const y = food.y * sy;
      const r = Math.max(4, food.radius * sx);
      const glow = ctx.createRadialGradient(x, y, 1, x, y, r * 2.6);
      glow.addColorStop(0, "rgba(255, 203, 99, 0.95)");
      glow.addColorStop(0.35, "rgba(255, 154, 72, 0.35)");
      glow.addColorStop(1, "rgba(255, 154, 72, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#f6b84f";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  };

  const drawAgents = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const sx = width / engine.width;
    const sy = height / engine.height;
    const step = Math.max(1, Math.ceil(engine.agents.length / 9000));
    ctx.save();
    for (let i = 0; i < engine.agents.length; i += step) {
      const agent = engine.agents[i];
      const e = Math.max(0, Math.min(1, agent.energy / engine.params.maxEnergy));
      const x = agent.x * sx;
      const y = agent.y * sy;
      ctx.fillStyle = agent.mode === 2 ? `rgba(124, 135, 129, ${0.26 + e * 0.35})` : `rgba(${Math.round(80 + e * 90)}, ${Math.round(160 + e * 90)}, ${Math.round(112 + e * 60)}, .72)`;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.7, agent.mass * 0.8), 0, TAU);
      ctx.fill();
      if (toggles.directions && i % (step * 8) === 0) {
        ctx.strokeStyle = "rgba(210,255,226,.42)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(agent.theta) * 6, y + Math.sin(agent.theta) * 6);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.035)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  };

  return (
    <div className="canvas-wrap">
      <canvas
        ref={canvasRef}
        className="simulation-canvas"
        aria-label="Physarum simulation canvas"
        onPointerDown={(event) => {
          const point = toSim(event);
          drawingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          useTool(point.sx, point.sy, false);
        }}
        onPointerMove={(event) => {
          const point = toSim(event);
          updateHover(event);
          if (drawingRef.current) useTool(point.sx, point.sy, true);
        }}
        onPointerUp={(event) => {
          drawingRef.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerLeave={() => {
          drawingRef.current = false;
          setHover(null);
        }}
      />
      <div className="canvas-hud">
        <span>{tool === "food" ? "Click to add food" : tool === "slime" ? "Drag to seed slime" : tool === "erase" ? "Drag to erase" : "Inspect signals"}</span>
        <span>{engine.agents.length.toLocaleString()} agents · {engine.foods.length} food</span>
      </div>
      {hover ? <div className="hover-readout" style={{ left: hover.x + 12, top: hover.y + 12 }}>{hover.text}</div> : null}
    </div>
  );
}

const TAU = Math.PI * 2;
