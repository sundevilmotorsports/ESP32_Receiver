function parseRPM(raw?: string): number | null {
  if (!raw) return null;
  const b = raw.split(' ').map(x => parseInt(x, 16));
  if (b.length < 2 || Number.isNaN(b[0]) || Number.isNaN(b[1])) return null;
  return (b[0] << 8) | b[1];
}

export default function RPMGauge({ telemHistory, max = 12000 }: { telemHistory: Record<string, { t: number; raw: string }[]>; max?: number }) {
  const hist = telemHistory['eng_f0'] ?? telemHistory['eng'] ?? [];
  const last = hist.length ? hist[hist.length - 1].raw : undefined;
  const rpm = parseRPM(last) ?? 0;
  const pct = Math.max(0, Math.min(1, rpm / max));
  // angle from -90deg (left) to +90deg (right)
  const angle = -90 + pct * 180;
  const rad = (angle * Math.PI) / 180;
  const cx = 70, cy = 70, r = 58;
  const nx = cx + Math.cos(rad) * r * 0.78;
  const ny = cy + Math.sin(rad) * r * 0.78;

  // color zones
  const zone = pct < 0.6 ? '#10b981' : pct < 0.85 ? '#f59e0b' : '#ef4444';

  return (
    <div className="w-72 p-3 bg-card border rounded-md flex items-center justify-center">
      <div className="flex items-center gap-4">
        <div>
          <div className="text-xs text-muted-foreground">Engine RPM</div>
          <div className="text-3xl font-semibold tabular-nums">{rpm}</div>
          <div className="text-xs text-muted-foreground">rpm</div>
        </div>
        <svg width={140} height={140} viewBox="0 0 140 140">
          {/* background semi-circle */}
          <path d={describeArc(cx,cy,r,-90,90)} fill="none" stroke="#1118271a" strokeWidth={12} strokeLinecap="round" />
          {/* colored arc representing pct */}
          <path d={describeArc(cx,cy,r,-90, -90 + pct*180)} fill="none" stroke={zone} strokeWidth={12} strokeLinecap="round" />
          {/* needle */}
          <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#111827" strokeWidth={3} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={4} fill="#111827" />
        </svg>
      </div>
    </div>
  );
}

// helper to create an SVG arc path for an arc from startAngle to endAngle (degrees)
function polarToCartesian(cx:number, cy:number, r:number, angleInDegrees:number) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return {
    x: cx + (r * Math.cos(angleInRadians)),
    y: cy + (r * Math.sin(angleInRadians))
  };
}

function describeArc(cx:number, cy:number, r:number, startAngle:number, endAngle:number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  const d = [
    'M', start.x, start.y,
    'A', r, r, 0, largeArcFlag, 0, end.x, end.y
  ].join(' ');
  return d;
}
