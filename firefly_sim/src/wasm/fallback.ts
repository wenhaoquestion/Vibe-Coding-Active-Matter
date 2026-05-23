import type {
  CityLightView,
  BatView,
  FireflyAdapter,
  FireflyView,
  Metrics,
  ObstacleView,
  ScanKind,
  ScanPoint,
  SimParams,
  SimSnapshot
} from '../state/types';

const TWO_PI = Math.PI * 2;
const HISTORY_LIMIT = 240;
const MAX_FIREFLIES = 3000;
const MAX_BATS = 64;

class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  normal(): number {
    const u = Math.max(this.next(), 1e-6);
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO_PI * v);
  }
}

function wrapPhase(theta: number): number {
  const wrapped = theta % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

function signedWrap(theta: number): number {
  return ((theta + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
}

function distToSegment(cx: number, cy: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 <= 1e-9) return Math.hypot(cx - ax, cy - ay);
  const t = Math.max(0, Math.min(1, ((cx - ax) * vx + (cy - ay) * vy) / len2));
  return Math.hypot(cx - (ax + t * vx), cy - (ay + t * vy));
}

function initialMetrics(): Metrics {
  return {
    r: 0,
    psi: 0,
    rLocalMean: 0,
    avgNeighbors: 0,
    isolatedCount: 0,
    flashCount: 0,
    cityLockDelta: 0,
    rA: 0,
    rB: 0,
    aliveCount: 0,
    capturedCount: 0,
    meanPanic: 0,
    meanNearestBatDistance: 0,
    batTargetCount: 0
  };
}

export class FallbackFireflyAdapter implements FireflyAdapter {
  readonly mode = 'fallback' as const;
  private params: SimParams;
  private fireflies: FireflyView[] = [];
  private obstacles: ObstacleView[] = [];
  private cityLights: CityLightView[] = [];
  private bats: BatView[] = [];
  private metrics = initialMetrics();
  private history: Metrics[] = [];
  private scanResults: ScanPoint[] = [];
  private estimatedKc: number | null = null;
  private rng = new Rng(1);
  private time = 0;
  private lastPsi = 0;

  constructor(params: SimParams) {
    this.params = { ...params };
  }

  async init(_width: number, _height: number, seed: number, params: SimParams): Promise<void> {
    this.reset(seed, params);
  }

  reset(seed: number, params: SimParams): void {
    this.params = { ...params };
    this.rng = new Rng(seed);
    this.time = 0;
    this.lastPsi = 0;
    this.history = [];
    this.scanResults = [];
    this.estimatedKc = null;
    this.obstacles = [];
    this.cityLights = [];
    this.bats = [];
    if (params.epsilon_city > 0) {
      this.cityLights.push({ x: params.L * 0.78, y: params.L * 0.28, radius: params.L * 0.32, epsilon: params.epsilon_city, omega: params.Omega_city, phase: params.phi_city });
    }
    this.fireflies = Array.from({ length: Math.min(params.N, MAX_FIREFLIES) }, (_, index) => this.makeFirefly(this.rng.next() * params.L, this.rng.next() * params.L, index));
    for (let i = 0; i < Math.min(params.batCount, MAX_BATS); i += 1) {
      this.addBat(this.rng.next() * params.L, this.rng.next() * params.L);
    }
    this.computeMetrics(0);
  }

  setParams(params: SimParams): void {
    const prior = this.params;
    this.params = { ...params };
    if (params.N !== this.fireflies.length) {
      if (params.N > this.fireflies.length) {
        const start = this.fireflies.length;
        const add = Math.min(params.N, MAX_FIREFLIES) - start;
        for (let i = 0; i < add; i += 1) this.fireflies.push(this.makeFirefly(this.rng.next() * params.L, this.rng.next() * params.L, start + i));
      } else {
        this.fireflies.length = Math.max(1, params.N);
      }
    }
    if (prior.epsilon_city <= 0 && params.epsilon_city > 0 && this.cityLights.length === 0) {
      this.addCityLight(params.L * 0.78, params.L * 0.28, params.L * 0.32, params.epsilon_city, params.Omega_city);
    }
    for (const light of this.cityLights) {
      light.epsilon = params.epsilon_city;
      light.omega = params.Omega_city;
    }
    if (params.batCount !== this.bats.length) {
      if (params.batCount > this.bats.length) {
        while (this.bats.length < Math.min(params.batCount, MAX_BATS)) this.addBat(this.rng.next() * params.L, this.rng.next() * params.L);
      } else {
        this.bats.length = Math.max(0, params.batCount);
      }
    }
    for (const bat of this.bats) {
      bat.speed = params.v_bat;
      bat.perceptionRadius = params.R_bat_perception;
      bat.captureRadius = params.R_capture;
    }
  }

  step(steps: number): void {
    for (let s = 0; s < steps; s += 1) this.stepOnce();
  }

  addFireflies(x: number, y: number, count: number, radius: number): void {
    const start = this.fireflies.length;
    for (let i = 0; i < count && this.fireflies.length < MAX_FIREFLIES; i += 1) {
      const angle = this.rng.next() * TWO_PI;
      const rr = Math.sqrt(this.rng.next()) * radius;
      this.fireflies.push(this.makeFirefly(x + Math.cos(angle) * rr, y + Math.sin(angle) * rr, start + i));
    }
    this.params.N = this.fireflies.length;
    this.computeMetrics(0);
  }

  eraseFireflies(x: number, y: number, radius: number): void {
    this.fireflies = this.fireflies.filter((f) => Math.hypot(f.x - x, f.y - y) > radius);
    this.params.N = this.fireflies.length;
    this.computeMetrics(0);
  }

  addObstacle(x: number, y: number, radius: number): void {
    this.obstacles.push({ x, y, radius });
    this.computeMetrics(0);
  }

  clearObstacles(): void {
    this.obstacles = [];
    this.computeMetrics(0);
  }

  addCityLight(x: number, y: number, radius: number, epsilon: number, omega: number): void {
    this.cityLights.push({ x, y, radius, epsilon, omega, phase: this.params.phi_city });
  }

  clearCityLights(): void {
    this.cityLights = [];
  }

  addBat(x: number, y: number): void {
    if (this.bats.length >= MAX_BATS) return;
    const heading = this.rng.next() * TWO_PI;
    this.bats.push({
      x: Math.max(0, Math.min(this.params.L, x)),
      y: Math.max(0, Math.min(this.params.L, y)),
      vx: Math.cos(heading) * this.params.v_bat,
      vy: Math.sin(heading) * this.params.v_bat,
      heading,
      speed: this.params.v_bat,
      perceptionRadius: this.params.R_bat_perception,
      captureRadius: this.params.R_capture,
      targetIndex: -1,
      hunger: 0
    });
    this.params.batCount = this.bats.length;
  }

  clearBats(): void {
    this.bats = [];
    this.params.batCount = 0;
    for (const f of this.fireflies) f.panic = 0;
    this.computeMetrics(0);
  }

  runScan(kind: ScanKind, min: number, max: number, samples: number, steps: number, burnIn: number, threshold: number): ScanPoint[] {
    const base = this.snapshotState();
    const results: ScanPoint[] = [];
    for (let i = 0; i < samples; i += 1) {
      const value = samples === 1 ? min : min + (max - min) * (i / (samples - 1));
      this.restoreState(base);
      const key = kind === 'K' ? 'K' : kind;
      this.params = { ...this.params, [key]: kind === 'batCount' ? Math.round(value) : value };
      this.setParams(this.params);
      let sum = 0;
      let count = 0;
      for (let step = 0; step < steps; step += 1) {
        this.stepOnce(false);
        if (step >= burnIn) {
          sum += this.metrics.r;
          count += 1;
        }
      }
      results.push({ value, rBar: count ? sum / count : this.metrics.r });
    }
    this.restoreState(base);
    this.scanResults = results;
    this.estimatedKc = results.find((p) => p.rBar >= threshold)?.value ?? null;
    return results;
  }

  getSnapshot(): SimSnapshot {
    return {
      mode: this.mode,
      time: this.time,
      fireflies: this.fireflies.map((f) => ({ ...f })),
      obstacles: this.obstacles.map((o) => ({ ...o })),
      cityLights: this.cityLights.map((c) => ({ ...c })),
      bats: this.bats.map((b) => ({ ...b })),
      metrics: { ...this.metrics },
      timeSeries: this.history.map((m) => ({ ...m })),
      scanResults: this.scanResults.map((p) => ({ ...p })),
      estimatedKc: this.estimatedKc
    };
  }

  private makeFirefly(x: number, y: number, index: number): FireflyView {
    const species = this.params.speciesMode === 2 && index % 2 === 1 ? 1 : 0;
    const mean = this.params.speciesMode === 2 ? (species === 0 ? this.params.omega_A : this.params.omega_B) : this.params.omega0;
    const heading = this.rng.next() * TWO_PI;
    return {
      x: Math.max(0, Math.min(this.params.L, x)),
      y: Math.max(0, Math.min(this.params.L, y)),
      vx: Math.cos(heading) * this.params.v_firefly,
      vy: Math.sin(heading) * this.params.v_firefly,
      heading,
      speed: this.params.v_firefly,
      theta: this.rng.next() * TWO_PI,
      omega: mean + this.params.sigma_omega * this.rng.normal(),
      brightness: 0,
      localOrder: 0,
      panic: 0,
      neighborCount: 0,
      species,
      alive: 1
    };
  }

  private stepOnce(record = true): void {
    this.updateBats();
    this.updateFireflyMotion();
    const n = this.fireflies.length;
    const next = new Array<number>(n);
    const noiseScale = Math.sqrt(Math.max(0, 2 * this.params.D * this.params.dt));
    let flashCount = 0;
    for (let i = 0; i < n; i += 1) {
      const current = this.fireflies[i];
      if (!current.alive) {
        next[i] = current.theta;
        continue;
      }
      let coupling = 0;
      let neighbors = 0;
      for (let j = 0; j < n; j += 1) {
        if (i === j) continue;
        const other = this.fireflies[j];
        if (!this.canSee(current, other)) continue;
        const kij = this.params.speciesMode === 2 ? (current.species === other.species ? this.params.K_in : this.params.K_out) : this.params.K;
        coupling += kij * Math.sin(other.theta - current.theta);
        neighbors += 1;
      }
      let drive = 0;
      for (const light of this.cityLights) {
        if (light.epsilon <= 0) continue;
        const distance = Math.hypot(current.x - light.x, current.y - light.y);
        const falloff = distance <= light.radius ? 1 - distance / Math.max(light.radius, 1e-6) : 0;
        drive += light.epsilon * falloff * Math.sin(light.omega * this.time + light.phase - current.theta);
      }
      const previous = current.theta;
      const dtheta = (current.omega + (neighbors ? coupling / neighbors : 0) + drive) * this.params.dt + noiseScale * this.rng.normal();
      const theta = wrapPhase(previous + dtheta);
      if (previous > theta) flashCount += 1;
      next[i] = theta;
      current.neighborCount = neighbors;
    }
    for (let i = 0; i < n; i += 1) {
      const f = this.fireflies[i];
      f.theta = next[i];
      f.brightness = f.alive ? this.brightness(f.theta) : 0;
    }
    this.time += this.params.dt;
    this.computeMetrics(flashCount);
    if (record) this.pushHistory();
  }

  private updateBats(): void {
    const turnScale = Math.sqrt(Math.max(0, 2 * this.params.batTurnNoise * this.params.dt));
    for (const bat of this.bats) {
      bat.speed = this.params.v_bat;
      bat.perceptionRadius = this.params.R_bat_perception;
      bat.captureRadius = this.params.R_capture;
      bat.targetIndex = -1;
      let bestScore = -1;
      for (let i = 0; i < this.fireflies.length; i += 1) {
        const f = this.fireflies[i];
        if (!f.alive) continue;
        const d = Math.hypot(f.x - bat.x, f.y - bat.y);
        if (d > bat.perceptionRadius) continue;
        const score = f.brightness / (d + 0.05);
        if (score > bestScore) {
          bestScore = score;
          bat.targetIndex = i;
        }
      }
      if (bat.targetIndex >= 0) {
        const target = this.fireflies[bat.targetIndex];
        const desired = Math.atan2(target.y - bat.y, target.x - bat.x);
        bat.heading = wrapPhase(bat.heading + signedWrap(desired - bat.heading) * 0.22);
      } else {
        bat.heading = wrapPhase(bat.heading + turnScale * this.rng.normal());
      }
      bat.vx = Math.cos(bat.heading) * bat.speed;
      bat.vy = Math.sin(bat.heading) * bat.speed;
      bat.x += bat.vx * this.params.dt;
      bat.y += bat.vy * this.params.dt;
      this.reflectInBounds(bat);
    }
  }

  private updateFireflyMotion(): void {
    if (!this.params.mobilityEnabled && this.bats.length === 0) return;
    const turnScale = Math.sqrt(Math.max(0, 2 * this.params.D_turn * this.params.dt));
    const moveScale = Math.sqrt(Math.max(0, 2 * this.params.D_move * this.params.dt));
    for (const f of this.fireflies) {
      if (!f.alive) continue;
      let avoidX = 0;
      let avoidY = 0;
      let panic = 0;
      for (const bat of this.bats) {
        const dx = f.x - bat.x;
        const dy = f.y - bat.y;
        const d = Math.hypot(dx, dy);
        if (d < this.params.R_avoid) {
          const weight = 1 - d / Math.max(this.params.R_avoid, 1e-6);
          avoidX += this.params.chi_bat * weight * dx / (d + 1e-4);
          avoidY += this.params.chi_bat * weight * dy / (d + 1e-4);
          panic = Math.max(panic, weight);
        }
        if (this.params.predationEnabled && d < this.params.R_capture) {
          f.alive = 0;
          f.brightness = 0;
          f.panic = 1;
        }
      }
      if (!f.alive) continue;
      f.panic = panic;
      if (this.params.mobilityEnabled) {
        f.heading = wrapPhase(f.heading + turnScale * this.rng.normal());
        f.speed = this.params.v_firefly;
        f.vx = Math.cos(f.heading) * f.speed + avoidX + moveScale * this.rng.normal();
        f.vy = Math.sin(f.heading) * f.speed + avoidY + moveScale * this.rng.normal();
        f.x += f.vx * this.params.dt;
        f.y += f.vy * this.params.dt;
        this.reflectInBounds(f);
      }
    }
  }

  private reflectInBounds(body: { x: number; y: number; vx: number; vy: number; heading: number }): void {
    if (body.x < 0) {
      body.x = -body.x;
      body.vx = Math.abs(body.vx);
    } else if (body.x > this.params.L) {
      body.x = 2 * this.params.L - body.x;
      body.vx = -Math.abs(body.vx);
    }
    if (body.y < 0) {
      body.y = -body.y;
      body.vy = Math.abs(body.vy);
    } else if (body.y > this.params.L) {
      body.y = 2 * this.params.L - body.y;
      body.vy = -Math.abs(body.vy);
    }
    body.x = Math.max(0, Math.min(this.params.L, body.x));
    body.y = Math.max(0, Math.min(this.params.L, body.y));
    if (Math.abs(body.vx) + Math.abs(body.vy) > 1e-6) body.heading = Math.atan2(body.vy, body.vx);
  }

  private canSee(a: FireflyView, b: FireflyView): boolean {
    if (!a.alive || !b.alive) return false;
    if (Math.hypot(a.x - b.x, a.y - b.y) > this.params.R_visual) return false;
    if (!this.params.blockVisibility) return true;
    return !this.obstacles.some((o) => distToSegment(o.x, o.y, a.x, a.y, b.x, b.y) <= o.radius);
  }

  private brightness(theta: number): number {
    if (this.params.flashMode === 'cosine') return (1 + Math.cos(theta)) / 2;
    if (this.params.flashMode === 'binary') return theta < this.params.dt * Math.max(this.params.omega0, 1) ? 1 : 0.08;
    const w = signedWrap(theta);
    return Math.exp(-(w * w) / (2 * this.params.sigma_flash * this.params.sigma_flash));
  }

  private computeMetrics(flashCount: number): void {
    const aliveCount = this.fireflies.filter((f) => f.alive).length;
    const n = Math.max(aliveCount, 1);
    let sx = 0;
    let sy = 0;
    let sxA = 0;
    let syA = 0;
    let sxB = 0;
    let syB = 0;
    let nA = 0;
    let nB = 0;
    let localSum = 0;
    let neighborSum = 0;
    let isolated = 0;
    let panicSum = 0;
    let nearestBatSum = 0;
    const batTargetCount = this.bats.filter((b) => b.targetIndex >= 0).length;
    for (const f of this.fireflies) {
      if (!f.alive) {
        f.neighborCount = 0;
        f.localOrder = 0;
        continue;
      }
      sx += Math.cos(f.theta);
      sy += Math.sin(f.theta);
      if (f.species === 0) {
        sxA += Math.cos(f.theta);
        syA += Math.sin(f.theta);
        nA += 1;
      } else {
        sxB += Math.cos(f.theta);
        syB += Math.sin(f.theta);
        nB += 1;
      }
      let lx = 0;
      let ly = 0;
      let k = 0;
      for (const other of this.fireflies) {
        if (f === other || !this.canSee(f, other)) continue;
        lx += Math.cos(other.theta);
        ly += Math.sin(other.theta);
        k += 1;
      }
      f.neighborCount = k;
      f.localOrder = k ? Math.hypot(lx / k, ly / k) : 0;
      localSum += f.localOrder;
      neighborSum += k;
      if (k === 0) isolated += 1;
      panicSum += f.panic;
      let nearest = this.params.L;
      for (const bat of this.bats) nearest = Math.min(nearest, Math.hypot(f.x - bat.x, f.y - bat.y));
      nearestBatSum += this.bats.length ? nearest : this.params.L;
    }
    const psi = Math.atan2(sy, sx);
    const dPsi = signedWrap(psi - this.lastPsi) / Math.max(this.params.dt, 1e-6);
    this.lastPsi = psi;
    this.metrics = {
      r: Math.hypot(sx / n, sy / n),
      psi,
      rLocalMean: localSum / n,
      avgNeighbors: neighborSum / n,
      isolatedCount: isolated,
      flashCount,
      cityLockDelta: Math.abs(dPsi - this.params.Omega_city),
      rA: nA ? Math.hypot(sxA / nA, syA / nA) : 0,
      rB: nB ? Math.hypot(sxB / nB, syB / nB) : 0,
      aliveCount,
      capturedCount: this.fireflies.length - aliveCount,
      meanPanic: panicSum / n,
      meanNearestBatDistance: nearestBatSum / n,
      batTargetCount
    };
  }

  private pushHistory(): void {
    this.history.push({ ...this.metrics });
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }

  private snapshotState() {
    return {
      params: { ...this.params },
      fireflies: this.fireflies.map((f) => ({ ...f })),
      obstacles: this.obstacles.map((o) => ({ ...o })),
      cityLights: this.cityLights.map((c) => ({ ...c })),
      bats: this.bats.map((b) => ({ ...b })),
      metrics: { ...this.metrics },
      history: this.history.map((m) => ({ ...m })),
      rngState: this.rng,
      time: this.time,
      lastPsi: this.lastPsi
    };
  }

  private restoreState(state: ReturnType<FallbackFireflyAdapter['snapshotState']>): void {
    this.params = { ...state.params };
    this.fireflies = state.fireflies.map((f) => ({ ...f }));
    this.obstacles = state.obstacles.map((o) => ({ ...o }));
    this.cityLights = state.cityLights.map((c) => ({ ...c }));
    this.bats = state.bats.map((b) => ({ ...b }));
    this.metrics = { ...state.metrics };
    this.history = state.history.map((m) => ({ ...m }));
    this.rng = state.rngState;
    this.time = state.time;
    this.lastPsi = state.lastPsi;
  }
}
