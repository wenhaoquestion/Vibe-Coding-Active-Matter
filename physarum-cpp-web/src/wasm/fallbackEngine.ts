import { defaultParams } from "../state/presets";
import type {
  AgentMode,
  AgentView,
  FoodView,
  Metrics,
  NetworkEdgeView,
  ParamKey,
  PresetName,
  SimParams,
  SimulatorBackend
} from "../state/types";

interface NodeView {
  x: number;
  y: number;
  kind: 0 | 1;
}

interface MutableEdge extends NetworkEdgeView {
  ai: number;
  bi: number;
  length: number;
}

const TAU = Math.PI * 2;
const MAX_AGENTS = 45000;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const sigmoid = (value: number) => 1 / (1 + Math.exp(-clamp(value, -60, 60)));
const wrapAngle = (value: number) => {
  let out = value;
  while (out <= -Math.PI) out += TAU;
  while (out > Math.PI) out -= TAU;
  return out;
};
const angleDelta = (from: number, to: number) => wrapAngle(to - from);

export class FallbackPhysarumEngine implements SimulatorBackend {
  readonly width: number;
  readonly height: number;
  readonly backendName = "TypeScript fallback";
  readonly trail: Float32Array;
  readonly foodField: Float32Array;
  readonly agents: AgentView[] = [];
  readonly foods: FoodView[] = [];
  readonly network: NetworkEdgeView[] = [];
  readonly params: SimParams = { ...defaultParams };
  metrics: Metrics = {
    alive: 0,
    agents: 0,
    foods: 0,
    totalBiomass: 0,
    avgEnergy: 0,
    foodRemaining: 0,
    searchCount: 0,
    exploitCount: 0,
    dormantCount: 0,
    pathLength: 0,
    transportCost: 0,
    dissipation: 0,
    backendCode: 0,
    fps: 0,
    stepsPerSecond: 0
  };

  private scratch: Float32Array;
  private seedState: number;
  private stepIndex = 0;
  private starvation = new WeakMap<AgentView, number>();
  private mutableNetwork: MutableEdge[] = [];

  constructor(width = 240, height = 160, seed = 19) {
    this.width = width;
    this.height = height;
    this.trail = new Float32Array(width * height);
    this.foodField = new Float32Array(width * height);
    this.scratch = new Float32Array(width * height);
    this.seedState = seed >>> 0 || 1;
    this.applyPreset("twoFoodMaze");
  }

  reset(seed = this.seedState): void {
    this.seedState = seed >>> 0 || 1;
    this.stepIndex = 0;
    this.agents.length = 0;
    this.foods.length = 0;
    this.network.length = 0;
    this.mutableNetwork = [];
    this.trail.fill(0);
    this.foodField.fill(0);
    this.applyPreset("twoFoodMaze");
  }

  applyPreset(name: PresetName): void {
    this.agents.length = 0;
    this.foods.length = 0;
    this.network.length = 0;
    this.mutableNetwork = [];
    this.trail.fill(0);
    this.foodField.fill(0);

    if (name === "empty") {
      this.updateFoodField();
      this.updateMetrics();
      return;
    }

    if (name === "twoFoodMaze") {
      this.addFood(this.width * 0.22, this.height * 0.32, 620, 14, 1.18);
      this.addFood(this.width * 0.78, this.height * 0.68, 520, 15, 0.95);
      this.addFood(this.width * 0.54, this.height * 0.23, 300, 9, 0.75);
      this.addAgents(this.width * 0.48, this.height * 0.52, 1050, 15, this.params.maxEnergy * 0.86);
    }

    if (name === "ringSearch") {
      const cx = this.width / 2;
      const cy = this.height / 2;
      for (let i = 0; i < 9; i += 1) {
        const a = (i / 9) * TAU;
        this.addFood(cx + Math.cos(a) * 78, cy + Math.sin(a) * 48, 260 + i * 18, 9, 0.85 + i * 0.03);
      }
      this.addAgents(cx, cy, 1800, 12, this.params.maxEnergy * 0.92);
    }

    if (name === "cityNodes") {
      const nodes = [
        [0.16, 0.22, 420], [0.32, 0.42, 260], [0.54, 0.28, 390],
        [0.78, 0.22, 310], [0.72, 0.66, 510], [0.45, 0.76, 350],
        [0.18, 0.68, 280]
      ];
      nodes.forEach(([x, y, c], index) => this.addFood(this.width * x, this.height * y, c, index % 2 ? 8 : 11, 1));
      this.addAgents(this.width * 0.5, this.height * 0.52, 1600, 16, 82);
    }

    if (name === "denseBloom") {
      this.addFood(this.width * 0.26, this.height * 0.5, 820, 18, 1.35);
      this.addFood(this.width * 0.72, this.height * 0.5, 760, 18, 1.25);
      this.addAgents(this.width * 0.5, this.height * 0.5, 4200, 28, 92);
    }

    this.updateFoodField();
    this.updateMetrics();
  }

  setParam(key: ParamKey, value: number): void {
    this.params[key] = value;
    if (key === "maxEnergy") {
      this.agents.forEach((agent) => {
        agent.energy = clamp(agent.energy, 0, value);
      });
    }
  }

  addAgents(x: number, y: number, count: number, radius: number, energy = this.params.maxEnergy * 0.75): void {
    const n = Math.max(0, Math.floor(count));
    for (let i = 0; i < n && this.agents.length < MAX_AGENTS; i += 1) {
      const a = this.rand() * TAU;
      const r = Math.sqrt(this.rand()) * radius;
      const agent: AgentView = {
        x: clamp(x + Math.cos(a) * r, 0, this.width - 1),
        y: clamp(y + Math.sin(a) * r, 0, this.height - 1),
        theta: this.rand() * TAU - Math.PI,
        energy: clamp(energy * (0.82 + this.rand() * 0.22), 0, this.params.maxEnergy),
        mass: 0.82 + this.rand() * 0.38,
        mode: 0,
        alive: true
      };
      this.starvation.set(agent, 0);
      this.agents.push(agent);
    }
    this.updateMetrics();
  }

  addFood(x: number, y: number, calories: number, radius: number, quality: number): void {
    this.foods.push({
      x: clamp(x, 0, this.width - 1),
      y: clamp(y, 0, this.height - 1),
      calories: Math.max(0, calories),
      radius: Math.max(2, radius),
      quality: Math.max(0.05, quality)
    });
    this.updateFoodField();
    this.updateMetrics();
  }

  erase(x: number, y: number, radius: number): void {
    const r2 = radius * radius;
    for (let i = this.agents.length - 1; i >= 0; i -= 1) {
      const agent = this.agents[i];
      if (this.distance2(agent.x, agent.y, x, y) <= r2) this.agents.splice(i, 1);
    }
    for (let i = this.foods.length - 1; i >= 0; i -= 1) {
      const food = this.foods[i];
      if (this.distance2(food.x, food.y, x, y) <= r2) this.foods.splice(i, 1);
    }
    const minX = Math.max(0, Math.floor(x - radius));
    const maxX = Math.min(this.width - 1, Math.ceil(x + radius));
    const minY = Math.max(0, Math.floor(y - radius));
    const maxY = Math.min(this.height - 1, Math.ceil(y + radius));
    for (let yy = minY; yy <= maxY; yy += 1) {
      for (let xx = minX; xx <= maxX; xx += 1) {
        if (this.distance2(xx, yy, x, y) <= r2) this.trail[this.idx(xx, yy)] = 0;
      }
    }
    this.updateFoodField();
    this.updateMetrics();
  }

  step(steps = 1): void {
    const n = Math.max(1, Math.floor(steps));
    for (let i = 0; i < n; i += 1) {
      this.updateFoodField();
      this.updateAgents();
      this.diffuseTrail();
      this.stepIndex += 1;
      if (this.stepIndex % Math.max(1, Math.round(this.params.networkInterval)) === 0) {
        this.updateNetwork();
      }
    }
    this.updateMetrics();
  }

  searchProbability(energy: number, signal: number): number {
    const e = clamp(energy / Math.max(1, this.params.maxEnergy), 0, 1);
    const enoughEnergy = sigmoid(9 * (e - 0.24));
    const weakSignal = 1 - sigmoid(2.8 * (signal - 0.42));
    return clamp(enoughEnergy * weakSignal, 0, 1);
  }

  private updateAgents(): void {
    const initialCount = this.agents.length;
    for (let i = 0; i < initialCount; i += 1) {
      const agent = this.agents[i];
      if (!agent.alive) continue;

      const front = this.combined(
        agent.x + Math.cos(agent.theta) * this.params.sensorDistance,
        agent.y + Math.sin(agent.theta) * this.params.sensorDistance
      );
      const leftAngle = agent.theta + this.params.sensorAngle;
      const rightAngle = agent.theta - this.params.sensorAngle;
      const left = this.combined(
        agent.x + Math.cos(leftAngle) * this.params.sensorDistance,
        agent.y + Math.sin(leftAngle) * this.params.sensorDistance
      );
      const right = this.combined(
        agent.x + Math.cos(rightAngle) * this.params.sensorDistance,
        agent.y + Math.sin(rightAngle) * this.params.sensorDistance
      );
      const maxSignal = Math.max(front, left, right);
      const pSearch = this.searchProbability(agent.energy, maxSignal);
      agent.mode = agent.energy < this.params.maxEnergy * 0.11 && maxSignal < 0.25 ? 2 : (this.rand() < pSearch ? 0 : 1);

      let turn = 0;
      if (left > front && left >= right) turn = this.params.turnAngle;
      if (right > front && right > left) turn = -this.params.turnAngle;
      const noise = agent.mode === 0 || maxSignal < 0.18 ? this.randSigned() * this.params.turnAngle * 0.85 : 0;
      agent.theta = wrapAngle(agent.theta + turn + noise);

      let fx = 0;
      let fy = 0;
      for (const food of this.foods) {
        if (food.calories <= 0) continue;
        const dx = food.x - agent.x;
        const dy = food.y - agent.y;
        const d2 = dx * dx + dy * dy + 18;
        const inv = 1 / Math.sqrt(d2);
        const pull = food.quality * food.calories / (food.calories + 220) / d2;
        fx += dx * inv * pull;
        fy += dy * inv * pull;
      }
      const force = Math.hypot(fx, fy);
      if (force > 1e-6) {
        const hunger = Math.pow(1 - clamp(agent.energy / this.params.maxEnergy, 0, 1), 1.35);
        const rho = clamp(force * 140 * hunger, 0, 0.74);
        agent.theta = wrapAngle(agent.theta + angleDelta(agent.theta, Math.atan2(fy, fx)) * rho);
      }

      const energyFactor = clamp(0.18 + 0.82 * agent.energy / this.params.maxEnergy, 0.12, 1);
      const modeFactor = agent.mode === 2 ? 0.18 : 1;
      const speed = this.params.speed * energyFactor * modeFactor;
      agent.x += Math.cos(agent.theta) * speed;
      agent.y += Math.sin(agent.theta) * speed;
      this.bounce(agent);

      const loss = this.params.baseMetabolism * agent.mass
        + this.params.moveCost * speed * speed * agent.mass
        + (agent.mode === 0 ? this.params.searchCost : 0);
      agent.energy = Math.max(0, agent.energy - loss);

      for (let f = this.foods.length - 1; f >= 0; f -= 1) {
        const food = this.foods[f];
        if (food.calories <= 0) continue;
        if (this.distance2(agent.x, agent.y, food.x, food.y) <= food.radius * food.radius) {
          const gain = Math.min(food.calories, this.params.eatRate * food.quality * 0.08);
          food.calories -= gain;
          agent.energy = clamp(agent.energy + gain * this.params.eatEfficiency, 0, this.params.maxEnergy);
          agent.mode = 1;
          if (food.calories <= 0.01) this.foods.splice(f, 1);
        }
      }

      if (agent.energy / this.params.maxEnergy > this.params.growthThreshold) {
        const dm = this.params.growthRate * (agent.energy / this.params.maxEnergy - this.params.growthThreshold) * agent.mass;
        agent.mass += dm;
        agent.energy = Math.max(0, agent.energy - this.params.growthCost * dm);
      }

      if (agent.mass > this.params.splitMass && agent.energy > this.params.splitEnergy && this.agents.length < MAX_AGENTS) {
        const child: AgentView = {
          ...agent,
          theta: wrapAngle(agent.theta + this.randSigned() * 1.4),
          x: clamp(agent.x + this.randSigned() * 3, 0, this.width - 1),
          y: clamp(agent.y + this.randSigned() * 3, 0, this.height - 1),
          mass: agent.mass * 0.46,
          energy: agent.energy * 0.46,
          mode: 0 as AgentMode
        };
        agent.mass *= 0.54;
        agent.energy *= 0.54;
        this.starvation.set(child, 0);
        this.agents.push(child);
      }

      const starved = agent.energy <= 0.001 ? (this.starvation.get(agent) ?? 0) + 1 : 0;
      this.starvation.set(agent, starved);
      if (starved > this.params.starvationSteps) agent.alive = false;
      this.deposit(agent);
    }
    for (let i = this.agents.length - 1; i >= 0; i -= 1) {
      if (!this.agents[i].alive) this.agents.splice(i, 1);
    }
  }

  private updateFoodField(): void {
    this.foodField.fill(0);
    for (const food of this.foods) {
      const sigma = Math.max(5, food.radius * 2);
      const reach = Math.ceil(sigma * 3);
      const minX = Math.max(0, Math.floor(food.x - reach));
      const maxX = Math.min(this.width - 1, Math.ceil(food.x + reach));
      const minY = Math.max(0, Math.floor(food.y - reach));
      const maxY = Math.min(this.height - 1, Math.ceil(food.y + reach));
      const amp = food.quality * food.calories / (food.calories + 260);
      const denom = 2 * sigma * sigma;
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          this.foodField[this.idx(x, y)] += amp * Math.exp(-this.distance2(x, y, food.x, food.y) / denom);
        }
      }
    }
  }

  private deposit(agent: AgentView): void {
    const x0 = Math.floor(agent.x);
    const y0 = Math.floor(agent.y);
    const tx = agent.x - x0;
    const ty = agent.y - y0;
    const energyFactor = clamp(agent.energy / this.params.maxEnergy, 0, 1);
    const modeFactor = agent.mode === 1 ? 1.25 : agent.mode === 2 ? 0.15 : 1;
    const amount = this.params.trailDeposit * agent.mass * energyFactor * modeFactor;
    this.splat(x0, y0, amount * (1 - tx) * (1 - ty));
    this.splat(x0 + 1, y0, amount * tx * (1 - ty));
    this.splat(x0, y0 + 1, amount * (1 - tx) * ty);
    this.splat(x0 + 1, y0 + 1, amount * tx * ty);
  }

  private diffuseTrail(): void {
    const mix = clamp(this.params.trailDiffuse, 0, 1);
    const decay = clamp(1 - this.params.trailDecay, 0, 1);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < this.width && yy < this.height) {
              sum += this.trail[this.idx(xx, yy)];
              n += 1;
            }
          }
        }
        const current = this.trail[this.idx(x, y)];
        this.scratch[this.idx(x, y)] = (current * (1 - mix) + (sum / n) * mix) * decay;
      }
    }
    this.trail.set(this.scratch);
  }

  private updateNetwork(): void {
    const nodes: NodeView[] = [];
    for (const food of this.foods) nodes.push({ x: food.x, y: food.y, kind: 1 });
    const stride = Math.max(10, Math.floor(Math.min(this.width, this.height) / 8));
    for (let y = Math.floor(stride / 2); y < this.height && nodes.length < 94; y += stride) {
      for (let x = Math.floor(stride / 2); x < this.width && nodes.length < 94; x += stride) {
        if (this.trail[this.idx(x, y)] > 0.18) nodes.push({ x, y, kind: 0 });
      }
    }
    if (nodes.length < 2) {
      this.network.length = 0;
      this.mutableNetwork = [];
      return;
    }

    const prev = this.mutableNetwork;
    const edges: MutableEdge[] = [];
    const radius = Math.max(this.width, this.height) * 0.22;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const length = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (length <= radius || nodes[i].kind + nodes[j].kind >= 2) {
          const old = prev.find((edge) =>
            Math.abs(edge.ax - nodes[i].x) < 1 && Math.abs(edge.ay - nodes[i].y) < 1
            && Math.abs(edge.bx - nodes[j].x) < 1 && Math.abs(edge.by - nodes[j].y) < 1
          );
          edges.push({
            ai: i,
            bi: j,
            ax: nodes[i].x,
            ay: nodes[i].y,
            bx: nodes[j].x,
            by: nodes[j].y,
            length: Math.max(1, length),
            conductance: old?.conductance ?? 0.16,
            flow: 0,
            path: false
          });
        }
      }
    }
    if (edges.length === 0) return;

    const source = 0;
    let target = nodes.findIndex((node, index) => index > 0 && node.kind === 1);
    if (target < 0) target = 1;
    const adj = Array.from({ length: nodes.length }, () => [] as Array<[number, number]>);
    edges.forEach((edge, index) => {
      adj[edge.ai].push([edge.bi, index]);
      adj[edge.bi].push([edge.ai, index]);
      edge.conductance = Math.max(0.035, edge.conductance * 0.965);
      edge.flow = 0;
      edge.path = false;
    });

    const dist = Array.from({ length: nodes.length }, () => Number.POSITIVE_INFINITY);
    const prevNode = Array.from({ length: nodes.length }, () => -1);
    const prevEdge = Array.from({ length: nodes.length }, () => -1);
    const open = new Set<number>([source]);
    dist[source] = 0;
    while (open.size > 0) {
      let u = -1;
      let best = Number.POSITIVE_INFINITY;
      open.forEach((node) => {
        if (dist[node] < best) {
          best = dist[node];
          u = node;
        }
      });
      open.delete(u);
      for (const [v, edgeIndex] of adj[u]) {
        const edge = edges[edgeIndex];
        const cost = edge.length / Math.pow(edge.conductance + 0.03, 0.8);
        if (dist[u] + cost < dist[v]) {
          dist[v] = dist[u] + cost;
          prevNode[v] = u;
          prevEdge[v] = edgeIndex;
          open.add(v);
        }
      }
    }

    let pathLength = 0;
    let cursor = target;
    while (cursor !== source && cursor >= 0 && prevEdge[cursor] >= 0) {
      const edge = edges[prevEdge[cursor]];
      edge.path = true;
      edge.flow = 1;
      edge.conductance = Math.min(4, edge.conductance + 0.22);
      pathLength += edge.length;
      cursor = prevNode[cursor];
    }

    let transportCost = 0;
    let dissipation = 0;
    edges.forEach((edge) => {
      transportCost += edge.length * edge.conductance;
      dissipation += edge.flow * edge.flow * edge.length / (edge.conductance + 1e-5);
    });
    this.metrics.pathLength = pathLength;
    this.metrics.transportCost = transportCost;
    this.metrics.dissipation = dissipation;
    this.mutableNetwork = edges;
    this.network.splice(0, this.network.length, ...edges.map(({ ax, ay, bx, by, conductance, flow, path }) => ({
      ax, ay, bx, by, conductance, flow, path
    })));
  }

  private updateMetrics(): void {
    let alive = 0;
    let totalBiomass = 0;
    let avgEnergy = 0;
    let searchCount = 0;
    let exploitCount = 0;
    let dormantCount = 0;
    this.agents.forEach((agent) => {
      if (!agent.alive) return;
      alive += 1;
      totalBiomass += agent.mass;
      avgEnergy += agent.energy;
      if (agent.mode === 0) searchCount += 1;
      if (agent.mode === 1) exploitCount += 1;
      if (agent.mode === 2) dormantCount += 1;
    });
    const foodRemaining = this.foods.reduce((sum, food) => sum + food.calories, 0);
    this.metrics = {
      ...this.metrics,
      alive,
      agents: this.agents.length,
      foods: this.foods.length,
      totalBiomass,
      avgEnergy: alive > 0 ? avgEnergy / alive : 0,
      foodRemaining,
      searchCount,
      exploitCount,
      dormantCount,
      backendCode: 0
    };
  }

  private combined(x: number, y: number): number {
    return this.sample(this.trail, x, y) + this.sample(this.foodField, x, y);
  }

  private sample(field: Float32Array, x: number, y: number): number {
    const sx = clamp(x, 0, this.width - 1);
    const sy = clamp(y, 0, this.height - 1);
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const x1 = Math.min(this.width - 1, x0 + 1);
    const y1 = Math.min(this.height - 1, y0 + 1);
    const tx = sx - x0;
    const ty = sy - y0;
    const a = field[this.idx(x0, y0)];
    const b = field[this.idx(x1, y0)];
    const c = field[this.idx(x0, y1)];
    const d = field[this.idx(x1, y1)];
    return (1 - tx) * (1 - ty) * a + tx * (1 - ty) * b + (1 - tx) * ty * c + tx * ty * d;
  }

  private bounce(agent: AgentView): void {
    if (agent.x < 0) {
      agent.x = 0;
      agent.theta = wrapAngle(Math.PI - agent.theta);
    } else if (agent.x > this.width - 1) {
      agent.x = this.width - 1;
      agent.theta = wrapAngle(Math.PI - agent.theta);
    }
    if (agent.y < 0) {
      agent.y = 0;
      agent.theta = wrapAngle(-agent.theta);
    } else if (agent.y > this.height - 1) {
      agent.y = this.height - 1;
      agent.theta = wrapAngle(-agent.theta);
    }
  }

  private splat(x: number, y: number, amount: number): void {
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) {
      this.trail[this.idx(x, y)] += amount;
    }
  }

  private idx(x: number, y: number): number {
    return y * this.width + x;
  }

  private distance2(ax: number, ay: number, bx: number, by: number): number {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  private rand(): number {
    this.seedState ^= this.seedState << 13;
    this.seedState ^= this.seedState >>> 17;
    this.seedState ^= this.seedState << 5;
    return ((this.seedState >>> 0) / 0xffffffff);
  }

  private randSigned(): number {
    return this.rand() * 2 - 1;
  }
}
