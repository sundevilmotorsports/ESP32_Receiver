import { TELEM_KEYS } from "./telemetry";

const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const fakeHex = (b: number) => Array.from({length: b}, () => rnd(0, 255).toString(16).toUpperCase().padStart(2, "0")).join(" ");

export interface TimingGate   { mac: string; timestamp_us: number; diff_us: number; stuck?: boolean; }
export interface GateConfig   { mac: string; mode: "delta" | "series"; group: string; order: number; }
export interface GateRow      { config: GateConfig; gate: TimingGate | null; }
export interface Telemetry    { key: string; value: string; }

export const FAKE_CONFIGS: GateConfig[] = [
  { mac: "AA:BB:CC:DD:EE:01", mode: "series", group: "track1", order: 0 },
  { mac: "AA:BB:CC:DD:EE:02", mode: "series", group: "track1", order: 1 },
];

export function generateFakeGates(): TimingGate[] {
  const base = Date.now() * 1000;
  return [
    { mac: "AA:BB:CC:DD:EE:01", timestamp_us: base,                   diff_us: rnd(900000, 1100000) },
    { mac: "AA:BB:CC:DD:EE:02", timestamp_us: base + rnd(10e6, 30e6), diff_us: rnd(900000, 1100000) },
  ];
}

export function generateFakeTelemetry(): Telemetry[] {
  return TELEM_KEYS.map(({ k, b }) => ({ key: k, value: fakeHex(b) }));
}

export const fmt     = (us: number)           => us === 0 ? "—" : (us / 1e6).toFixed(3) + "s";
export const fmtDiff = (a: number, b: number) => (a === 0 || b === 0) ? "—" : ((b - a) / 1e6).toFixed(3) + "s";

export const fmtTimestamp = (us: number): string => {
  if (us === 0) return "—";
  const totalMs  = Math.floor(us / 1000);
  const ms       = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s        = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m        = totalMin % 60;
  const h        = Math.floor(totalMin / 60) % 24;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
};

