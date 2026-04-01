// helper to create an SVG arc path
function polarToCartesian(cx: number, cy: number, r: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return { x: cx + r * Math.cos(angleInRadians), y: cy + r * Math.sin(angleInRadians) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end   = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return ['M', start.x, start.y, 'A', r, r, 0, largeArcFlag, 0, end.x, end.y].join(' ');
}

interface GaugeProps {
  value: number;
  max: number;
  label: string;
  unit: string;
  /** color thresholds — each entry: { pct: 0-1, color: hex }. First matching (>=) wins from highest. */
  zones?: { pct: number; color: string }[];
}

/** Generic semicircular gauge. Label top-left, arc centered, value below. */
export function Gauge({ value, max, label, unit, zones }: GaugeProps) {
  const pct = Math.max(0, Math.min(1, value / max));
  const cx = 70, cy = 68, r = 54;

  const defaultZones = [
    { pct: 0.85, color: '#ef4444' },
    { pct: 0.60, color: '#f59e0b' },
    { pct: 0,    color: '#10b981' },
  ];
  const z = zones ?? defaultZones;
  const activeZone = z.find(zone => pct >= zone.pct) ?? z[z.length - 1];
  const zoneColor = activeZone.color;

  return (
    <div className="w-44 shrink-0 p-4 bg-card border rounded-md flex flex-col gap-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <svg width="100%" viewBox="0 0 140 76" className="overflow-visible">
        {/* track */}
        <path d={describeArc(cx, cy, r, -90, 90)} fill="none" stroke="currentColor" strokeWidth={10} strokeLinecap="round" opacity={0.08} />
        {/* filled arc */}
        {pct > 0 && <path d={describeArc(cx, cy, r, -90, -90 + pct * 180)} fill="none" stroke={zoneColor} strokeWidth={10} strokeLinecap="round" />}
      </svg>
      <div className="text-center">
        <span className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</span>
        <span className="text-xs text-muted-foreground ml-1">{unit}</span>
      </div>
    </div>
  );
}

type TelemHistory = Record<string, { t: number; raw: string }[]>;

function lastRaw(hist: TelemHistory, key: string): string | undefined {
  const arr = hist[key] ?? [];
  return arr.length ? arr[arr.length - 1].raw : undefined;
}

function parseU16BE(raw: string | undefined, byteOffset: number): number | null {
  if (!raw) return null;
  const b = raw.split(' ').map(x => parseInt(x, 16));
  if (b.length < byteOffset + 2 || Number.isNaN(b[byteOffset]) || Number.isNaN(b[byteOffset + 1])) return null;
  return (b[byteOffset] << 8) | b[byteOffset + 1];
}

function parseU8(raw: string | undefined, byteOffset: number): number | null {
  if (!raw) return null;
  const b = raw.split(' ').map(x => parseInt(x, 16));
  if (b.length <= byteOffset || Number.isNaN(b[byteOffset])) return null;
  return b[byteOffset];
}

export default function RPMGauge({ telemHistory, max = 12000 }: { telemHistory: TelemHistory; max?: number }) {
  const rpm = parseU16BE(lastRaw(telemHistory, 'eng_f0'), 0) ?? 0;
  return <Gauge value={rpm} max={max} label="Engine RPM" unit="rpm" />;
}

export function OilTempGauge({ telemHistory }: { telemHistory: TelemHistory }) {
  const temp = parseU8(lastRaw(telemHistory, 'eng_f0'), 3) ?? 0;
  return (
    <Gauge
      value={temp}
      max={150}
      label="Oil Temp"
      unit="°C"
      zones={[
        { pct: 0.80, color: '#ef4444' }, // >120 °C  red
        { pct: 0.60, color: '#f59e0b' }, // >90 °C   amber
        { pct: 0,    color: '#10b981' },
      ]}
    />
  );
}

export function OilPressGauge({ telemHistory }: { telemHistory: TelemHistory }) {
  const press = parseU16BE(lastRaw(telemHistory, 'eng_f0'), 4) ?? 0;
  return (
    <Gauge
      value={press}
      max={700}
      label="Oil Press"
      unit="kPa"
      zones={[
        { pct: 0.75, color: '#f59e0b' }, // >525 kPa  amber (high)
        { pct: 0.14, color: '#10b981' }, // 100-525    green (normal)
        { pct: 0,    color: '#ef4444' }, // <100 kPa   red (dangerously low)
      ]}
    />
  );
}
