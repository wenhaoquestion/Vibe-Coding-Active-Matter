import { energyColor } from "./colormap";
import type { NetworkState } from "../wasm/types";
import type { WasmSimulation } from "../wasm/loader";

export interface RenderOptions {
  showAgents: boolean;
  showNetwork: boolean;
  showShortestPath: boolean;
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly fieldCanvas = document.createElement("canvas");
  private readonly fieldCtx: CanvasRenderingContext2D;
  private dpr = 1;
  private simWidth = 1;
  private simHeight = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    const fieldCtx = this.fieldCanvas.getContext("2d", { alpha: false });
    if (!ctx || !fieldCtx) {
      throw new Error("Canvas2D is not available in this browser.");
    }
    this.ctx = ctx;
    this.fieldCtx = fieldCtx;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    const nextWidth = Math.max(320, Math.floor(rect.width * this.dpr));
    const nextHeight = Math.max(240, Math.floor(rect.height * this.dpr));
    if (this.canvas.width !== nextWidth || this.canvas.height !== nextHeight) {
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
    }
  }

  canvasToSim(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * this.simWidth,
      y: ((clientY - rect.top) / rect.height) * this.simHeight,
    };
  }

  render(sim: WasmSimulation, network: NetworkState | null, options: RenderOptions): void {
    this.resize();
    this.simWidth = sim.renderWidth();
    this.simHeight = sim.renderHeight();
    const buffer = sim.renderBuffer();
    if (this.fieldCanvas.width !== this.simWidth || this.fieldCanvas.height !== this.simHeight) {
      this.fieldCanvas.width = this.simWidth;
      this.fieldCanvas.height = this.simHeight;
    }
    const image = new ImageData(buffer, this.simWidth, this.simHeight);
    this.fieldCtx.putImageData(image, 0, 0);

    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.fieldCanvas, 0, 0, this.canvas.width, this.canvas.height);
    if (options.showNetwork && network) {
      this.drawNetwork(network, options.showShortestPath);
    }
    if (options.showAgents) {
      this.drawAgents(sim.agentBuffer());
    }
  }

  private sx(x: number): number {
    return (x / this.simWidth) * this.canvas.width;
  }

  private sy(y: number): number {
    return (y / this.simHeight) * this.canvas.height;
  }

  private drawAgents(agentBuffer: Float32Array): void {
    const count = Math.floor(agentBuffer.length / 5);
    if (count === 0) {
      return;
    }
    const scale = Math.min(this.canvas.width / this.simWidth, this.canvas.height / this.simHeight);
    const dot = Math.max(1.0, 1.35 * this.dpr);
    this.ctx.save();
    for (let i = 0; i < count; i += 1) {
      const j = i * 5;
      const x = this.sx(agentBuffer[j]);
      const y = this.sy(agentBuffer[j + 1]);
      const angle = agentBuffer[j + 2];
      const energy = agentBuffer[j + 3];
      const search = agentBuffer[j + 4] > 0.5;
      this.ctx.fillStyle = energyColor(energy, search);
      this.ctx.globalAlpha = 0.78;
      this.ctx.fillRect(x - dot * 0.5, y - dot * 0.5, dot, dot);
      if (count < 4500 && i % 3 === 0) {
        this.ctx.globalAlpha = 0.48;
        this.ctx.strokeStyle = search ? "rgb(120 240 210)" : "rgb(255 222 135)";
        this.ctx.lineWidth = Math.max(0.6, 0.75 * this.dpr);
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x + Math.cos(angle) * 4.2 * scale, y + Math.sin(angle) * 4.2 * scale);
        this.ctx.stroke();
      }
    }
    this.ctx.restore();
  }

  private drawNetwork(network: NetworkState, showShortestPath: boolean): void {
    if (!network.nodes.length || !network.edges.length) {
      return;
    }
    const nodeMap = new Map(network.nodes.map((node) => [node.id, node]));
    this.ctx.save();
    this.ctx.lineCap = "round";
    for (const edge of network.edges) {
      if (edge.shortest) {
        continue;
      }
      const a = nodeMap.get(edge.a);
      const b = nodeMap.get(edge.b);
      if (!a || !b) {
        continue;
      }
      const conductivity = Math.max(0, edge.conductivity);
      const flow = Math.min(1, Math.abs(edge.flow) * 2);
      this.ctx.globalAlpha = 0.12 + 0.38 * flow;
      this.ctx.lineWidth = Math.max(0.5, Math.min(8, (0.5 + conductivity * 0.65) * this.dpr));
      this.ctx.strokeStyle = conductivity > 1.4 ? "rgb(158 238 143)" : "rgb(80 130 126)";
      this.ctx.beginPath();
      this.ctx.moveTo(this.sx(a.x), this.sy(a.y));
      this.ctx.lineTo(this.sx(b.x), this.sy(b.y));
      this.ctx.stroke();
    }
    if (showShortestPath) {
      for (const edge of network.edges) {
        if (!edge.shortest) {
          continue;
        }
        const a = nodeMap.get(edge.a);
        const b = nodeMap.get(edge.b);
        if (!a || !b) {
          continue;
        }
        this.ctx.globalAlpha = 0.9;
        this.ctx.lineWidth = 3.2 * this.dpr;
        this.ctx.strokeStyle = "rgb(255 238 116)";
        this.ctx.beginPath();
        this.ctx.moveTo(this.sx(a.x), this.sy(a.y));
        this.ctx.lineTo(this.sx(b.x), this.sy(b.y));
        this.ctx.stroke();
      }
    }
    for (const node of network.nodes) {
      if (!node.food && !node.sink) {
        continue;
      }
      this.ctx.globalAlpha = 0.9;
      this.ctx.fillStyle = node.food ? "rgb(255 184 64)" : "rgb(126 230 204)";
      this.ctx.beginPath();
      this.ctx.arc(this.sx(node.x), this.sy(node.y), (node.food ? 4.0 : 3.0) * this.dpr, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }
}
