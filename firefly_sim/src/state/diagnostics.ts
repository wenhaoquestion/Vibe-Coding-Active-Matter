import type { SimParams, SimSnapshot } from './types';

export type DiagnosticLevel = 'info' | 'warn' | 'error';

export interface DiagnosticEntry {
  id: number;
  time: string;
  level: DiagnosticLevel;
  message: string;
  details?: string;
}

type Listener = (entries: DiagnosticEntry[]) => void;

const MAX_ENTRIES = 80;
let nextId = 1;
let entries: DiagnosticEntry[] = [];
const listeners = new Set<Listener>();

function serialize(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ''}`.trim();
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function emit() {
  const snapshot = [...entries];
  for (const listener of listeners) listener(snapshot);
}

export function logDiagnostic(level: DiagnosticLevel, message: string, details?: unknown) {
  const entry: DiagnosticEntry = {
    id: nextId++,
    time: new Date().toLocaleTimeString(),
    level,
    message,
    details: serialize(details)
  };
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  if (level !== 'info') {
    const consoleMethod = level === 'error' ? console.error : console.warn;
    consoleMethod(`[firefly:${level}] ${message}${entry.details ? `\n${entry.details}` : ''}`);
  }
  emit();
}

export function subscribeDiagnostics(listener: Listener): () => void {
  listeners.add(listener);
  listener([...entries]);
  return () => {
    listeners.delete(listener);
  };
}

export function clearDiagnostics() {
  entries = [];
  emit();
}

export function summarizeParams(params: SimParams) {
  return {
    N: params.N,
    K: params.K,
    R_visual: params.R_visual,
    speed: params.speed,
    mobilityEnabled: params.mobilityEnabled,
    moveProbability: params.moveProbability,
    batCount: params.batCount,
    v_bat: params.v_bat,
    R_bat_perception: params.R_bat_perception,
    batTopK: params.batTopK,
    batSoftmaxTemperature: params.batSoftmaxTemperature
  };
}

export function summarizeSnapshot(snapshot: SimSnapshot | null) {
  if (!snapshot) return null;
  return {
    mode: snapshot.mode,
    time: Number(snapshot.time.toFixed(3)),
    fireflies: snapshot.fireflies.length,
    bats: snapshot.bats.length,
    obstacles: snapshot.obstacles.length,
    cityLights: snapshot.cityLights.length,
    metrics: {
      r: Number(snapshot.metrics.r.toFixed(3)),
      alive: snapshot.metrics.aliveCount,
      captured: snapshot.metrics.capturedCount,
      panic: Number(snapshot.metrics.meanPanic.toFixed(3)),
      targets: snapshot.metrics.batTargetCount
    }
  };
}

export function installGlobalDiagnostics() {
  window.addEventListener('error', (event) => {
    logDiagnostic('error', 'Unhandled browser error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: serialize(event.error)
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    logDiagnostic('error', 'Unhandled promise rejection', event.reason);
  });
}
