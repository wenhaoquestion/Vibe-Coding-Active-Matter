import { useEffect, useRef, useState } from 'react';
import type { FireflyView, SimParams, SimSnapshot, ToolMode } from '../state/types';

interface SimulationCanvasProps {
  snapshot: SimSnapshot | null;
  params: SimParams;
  tool: ToolMode;
  showEdges: boolean;
  showHeatmap: boolean;
  showPhase: boolean;
  onAddFireflies: (x: number, y: number, count: number, radius: number) => void;
  onEraseFireflies: (x: number, y: number, radius: number) => void;
  onAddObstacle: (x: number, y: number, radius: number) => void;
  onAddCityLight: (x: number, y: number) => void;
  onAddBat: (x: number, y: number) => void;
}

function phaseColor(theta: number, alpha = 1): string {
  const hue = (theta / (Math.PI * 2)) * 360;
  return `hsla(${hue}, 90%, 62%, ${alpha})`;
}

function nearestFirefly(fireflies: FireflyView[], x: number, y: number, maxDistance: number): FireflyView | null {
  let best: FireflyView | null = null;
  let bestD = maxDistance;
  for (const f of fireflies) {
    if (!f.alive) continue;
    const d = Math.hypot(f.x - x, f.y - y);
    if (d < bestD) {
      best = f;
      bestD = d;
    }
  }
  return best;
}

export function SimulationCanvas({
  snapshot,
  params,
  tool,
  showEdges,
  showHeatmap,
  showPhase,
  onAddFireflies,
  onEraseFireflies,
  onAddObstacle,
  onAddCityLight,
  onAddBat
}: SimulationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hovered, setHovered] = useState<FireflyView | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#07100d';
    ctx.fillRect(0, 0, rect.width, rect.height);

    const sx = rect.width / params.L;
    const sy = rect.height / params.L;
    const scale = Math.min(sx, sy);
    const toX = (x: number) => x * sx;
    const toY = (y: number) => y * sy;

    if (showEdges && snapshot.fireflies.length <= 800) {
      ctx.strokeStyle = 'rgba(255, 216, 111, 0.045)';
      ctx.lineWidth = 1;
      for (let i = 0; i < snapshot.fireflies.length; i += 1) {
        const a = snapshot.fireflies[i];
        for (let j = i + 1; j < snapshot.fireflies.length; j += 1) {
          const b = snapshot.fireflies[j];
          if (Math.hypot(a.x - b.x, a.y - b.y) > params.R_visual) continue;
          ctx.beginPath();
          ctx.moveTo(toX(a.x), toY(a.y));
          ctx.lineTo(toX(b.x), toY(b.y));
          ctx.stroke();
        }
      }
    }

    for (const light of snapshot.cityLights) {
      const grad = ctx.createRadialGradient(toX(light.x), toY(light.y), 0, toX(light.x), toY(light.y), light.radius * scale);
      grad.addColorStop(0, 'rgba(100, 180, 255, 0.24)');
      grad.addColorStop(1, 'rgba(100, 180, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(toX(light.x), toY(light.y), light.radius * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const obstacle of snapshot.obstacles) {
      ctx.fillStyle = 'rgba(24, 45, 35, 0.88)';
      ctx.strokeStyle = 'rgba(120, 166, 130, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(toX(obstacle.x), toY(obstacle.y), obstacle.radius * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    for (const bat of snapshot.bats) {
      const x = toX(bat.x);
      const y = toY(bat.y);
      ctx.strokeStyle = 'rgba(190, 96, 255, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, bat.perceptionRadius * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 86, 86, 0.55)';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(3, bat.captureRadius * scale), 0, Math.PI * 2);
      ctx.stroke();
      if (bat.targetIndex >= 0 && snapshot.fireflies[bat.targetIndex]) {
        const target = snapshot.fireflies[bat.targetIndex];
        ctx.strokeStyle = 'rgba(255, 98, 98, 0.32)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(toX(target.x), toY(target.y));
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(164, 78, 214, 0.95)';
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(bat.heading) * 9, y + Math.sin(bat.heading) * 9);
      ctx.lineTo(x + Math.cos(bat.heading + 2.45) * 7, y + Math.sin(bat.heading + 2.45) * 7);
      ctx.lineTo(x + Math.cos(bat.heading - 2.45) * 7, y + Math.sin(bat.heading - 2.45) * 7);
      ctx.closePath();
      ctx.fill();
    }

    for (const f of snapshot.fireflies) {
      if (!f.alive) continue;
      const x = toX(f.x);
      const y = toY(f.y);
      const heat = showHeatmap ? Math.max(f.localOrder, f.panic) : 0;
      if (showHeatmap) {
        ctx.fillStyle = f.panic > f.localOrder ? `rgba(255, 42, 82, ${0.06 + heat * 0.24})` : `rgba(255, 136, 50, ${0.05 + heat * 0.18})`;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(5, params.R_visual * scale * 0.18), 0, Math.PI * 2);
        ctx.fill();
      }
      const glow = 2 + f.brightness * 11;
      const body = 1.5 + f.brightness * 3.5;
      ctx.fillStyle = `rgba(255, 205, 76, ${0.05 + f.brightness * 0.35})`;
      ctx.beginPath();
      ctx.arc(x, y, glow, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = showPhase ? phaseColor(f.theta, 0.95) : `rgba(255, ${180 + f.brightness * 70}, 70, 0.95)`;
      ctx.beginPath();
      ctx.arc(x, y, body, 0, Math.PI * 2);
      ctx.fill();
      if (f.species === 1) {
        ctx.strokeStyle = 'rgba(130, 215, 255, 0.7)';
        ctx.stroke();
      }
    }

    ctx.strokeStyle = 'rgba(255, 222, 122, 0.85)';
    ctx.lineWidth = 2;
    const cx = rect.width - 42;
    const cy = 42;
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(snapshot.metrics.psi) * 21 * snapshot.metrics.r, cy + Math.sin(snapshot.metrics.psi) * 21 * snapshot.metrics.r);
    ctx.stroke();
  }, [snapshot, params, showEdges, showHeatmap, showPhase]);

  const toModel = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * params.L,
      y: ((event.clientY - rect.top) / rect.height) * params.L
    };
  };

  const applyTool = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toModel(event);
    const brush = event.shiftKey || event.altKey ? 0.8 : 0.32;
    if (tool === 'add') onAddFireflies(p.x, p.y, event.shiftKey ? 16 : 5, brush);
    if (tool === 'erase') onEraseFireflies(p.x, p.y, brush);
    if (tool === 'obstacle') onAddObstacle(p.x, p.y, params.obstacleRadius);
    if (tool === 'city') onAddCityLight(p.x, p.y);
    if (tool === 'bat') onAddBat(p.x, p.y);
  };

  const handleMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!snapshot) return;
    const p = toModel(event);
    setHovered(nearestFirefly(snapshot.fireflies, p.x, p.y, 0.25));
    if (event.buttons === 1 && (tool === 'add' || tool === 'erase')) applyTool(event);
  };

  return (
    <div className="canvas-wrap">
      <canvas
        ref={canvasRef}
        className="simulation-canvas"
        onPointerDown={applyTool}
        onPointerMove={handleMove}
        onPointerLeave={() => setHovered(null)}
      />
      <div className="canvas-badge">
        {snapshot ? `${snapshot.metrics.aliveCount.toFixed(0)}/${snapshot.fireflies.length} fireflies · ${snapshot.mode.toUpperCase()}` : 'loading'}
      </div>
      {hovered && (
        <div className="hover-card">
          theta {hovered.theta.toFixed(2)} · omega {hovered.omega.toFixed(2)}
          <br />
          brightness {hovered.brightness.toFixed(2)} · k {hovered.neighborCount} · local r {hovered.localOrder.toFixed(2)}
        </div>
      )}
    </div>
  );
}
