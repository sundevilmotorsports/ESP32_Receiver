type TelemHistory = Record<string, { t: number; raw: string }[]>;

function lastRaw(hist: TelemHistory, key: string): string | undefined {
  const arr = hist[key] ?? [];
  return arr.length ? arr[arr.length - 1].raw : undefined;
}

function i16be(b: number[], i: number): number {
  const v = (b[i] << 8) | b[i + 1];
  return v > 32767 ? v - 65536 : v;
}

function parseAccel(raw: string | undefined): { x: number; y: number } | null {
  if (!raw) return null;
  const b = raw.split(' ').map(h => parseInt(h, 16));
  if (b.length < 4) return null;
  return { x: i16be(b, 0), y: i16be(b, 2) };
}

export default function IMUBall({ telemHistory }: { telemHistory: TelemHistory }) {
  const raw   = lastRaw(telemHistory, 'imu_accel');
  const accel = parseAccel(raw);

  const SIZE   = 140;
  const cx     = SIZE / 2;
  const cy     = SIZE / 2;
  const outerR = SIZE / 2 - 6;   // boundary circle radius
  const ballR  = 9;
  const CLAMP  = 1000;            // ±1000 mg = full deflection

  // map accel mg → pixel offset, clamped to outer ring
  const ax = accel ? Math.max(-CLAMP, Math.min(CLAMP, accel.x)) : 0;
  const ay = accel ? Math.max(-CLAMP, Math.min(CLAMP, accel.y)) : 0;
  const maxOffset = outerR - ballR - 2;
  const bx = cx + (ax / CLAMP) * maxOffset;
  const by = cy + (ay / CLAMP) * maxOffset;

  // color: green near center, red near edge
  const dist = Math.sqrt(ax * ax + ay * ay) / CLAMP;
  const ballColor = dist < 0.3 ? '#10b981' : dist < 0.7 ? '#f59e0b' : '#ef4444';

  return (
    <div className="w-56 shrink-0 p-3 bg-card border rounded-md flex flex-col items-center gap-1">
      <div className="text-xs text-muted-foreground self-start">IMU Lateral</div>
      <svg width={SIZE} height={SIZE}>
        {/* zone rings */}
        <circle cx={cx} cy={cy} r={outerR * 0.3} fill="none" stroke="#10b98130" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={outerR * 0.7} fill="none" stroke="#f59e0b30" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={outerR}        fill="none" stroke="#ef444430" strokeWidth={1} />
        {/* crosshair */}
        <line x1={cx - outerR} y1={cy} x2={cx + outerR} y2={cy} stroke="currentColor" strokeWidth={0.5} opacity={0.2} />
        <line x1={cx} y1={cy - outerR} x2={cx} y2={cy + outerR} stroke="currentColor" strokeWidth={0.5} opacity={0.2} />
        {/* ball */}
        <circle cx={bx} cy={by} r={ballR} fill={ballColor} opacity={0.85} />
        <circle cx={bx} cy={by} r={ballR} fill="none" stroke={ballColor} strokeWidth={1.5} />
      </svg>
      {accel && (
        <div className="flex gap-4 text-xs font-mono tabular-nums text-muted-foreground">
          <span>X {accel.x > 0 ? '+' : ''}{accel.x} mg</span>
          <span>Y {accel.y > 0 ? '+' : ''}{accel.y} mg</span>
        </div>
      )}
    </div>
  );
}
