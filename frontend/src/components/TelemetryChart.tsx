import { useMemo, useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface Series { key: string; label: string; unit: string; color: string; extractor: (raw: string) => number | null }
interface Point { t: number; v: number }

const COLORS = ["#ef4444", "#f59e0b", "#10b981", "#60a5fa", "#7c3aed", "#ec4899", "#14b8a6"];

function hexToSeries() {
  const series: Series[] = [
    { key: 'eng_f0', label: 'RPM', unit: 'rpm', color: COLORS[0], extractor: (r) => { const b = r.split(' ').map(x=>parseInt(x,16)); if (b.length>=2) return (b[0]<<8)|b[1]; return null } },
    { key: 'oil_temp', label: 'Oil Temp', unit: '°C', color: COLORS[1], extractor: (r) => { const b = r.split(' ').map(x=>parseInt(x,16)); // try eng_f0 byte 3
        if (b.length>=4) return b[3]; return null } },
    { key: 'oil_press', label: 'Oil Press', unit: 'kPa', color: COLORS[2], extractor: (r) => { const b = r.split(' ').map(x=>parseInt(x,16)); // try eng_f0 u16be at 4
        if (b.length>=6) return (b[4]<<8)|b[5]; return null } },
    { key: 'fuel_press', label: 'Fuel Press', unit: 'kPa', color: COLORS[3], extractor: (r) => { const b = r.split(' ').map(x=>parseInt(x,16)); // eng_f2 u16be at 2
        if (b.length>=4) return (b[2]<<8)|b[3]; return null } },
  ];
  return series;
}

export default function TelemetryChart({ telemHistory, height = 180 }: { telemHistory: Record<string, { t: number; raw: string }[]>; height?: number }) {
    const seriesDefs = useMemo(() => hexToSeries(), []);
    const [enabled, setEnabled] = useState<Record<string, boolean>>(() => Object.fromEntries(seriesDefs.map(s => [s.key, s.key === 'eng_f0' || s.key === 'oil_press'])));
  // responsive width measurement
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(760);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.floor(e.contentRect.width);
        setWidth(w || 760);
      }
    });
    ro.observe(el);
    setWidth(Math.floor(el.clientWidth) || 760);
    return () => ro.disconnect();
  }, []);

  // build points for each series using appropriate telemetry keys
  // mapping series -> possible source keys in telemHistory
  const seriesPoints: Record<string, Point[]> = {};
  for (const s of seriesDefs) {
    seriesPoints[s.key] = [];
    // map series to source telemetry keys
    const sourceKeys = (() => {
      switch (s.key) {
        case 'eng_f0': return ['eng_f0'];
        case 'oil_temp': return ['eng_f0'];
        case 'oil_press': return ['eng_f0', 'eng_f1'];
        case 'fuel_press': return ['eng_f2'];
        default: return [s.key];
      }
    })();

    // gather points from available history keys
    for (const src of sourceKeys) {
      const hist = telemHistory[src] ?? [];
      for (const p of hist) {
        try {
          const v = s.extractor(p.raw);
          if (v !== null && Number.isFinite(v)) seriesPoints[s.key].push({ t: p.t, v });
        } catch (e) { /* ignore parse errors */ }
      }
    }
    seriesPoints[s.key].sort((a,b)=>a.t-b.t);
  }

  // chart sizing (full container width)
  const totalW = width || 760;
  // left area: allocate columns for enabled series labels so they don't overlap
  const enabledKeys = seriesDefs.filter(s => enabled[s.key]);
  const leftColWidth = 64; // narrower per-series left column width (compressed Y axis values)
  const leftAreaWidth = Math.max(48, enabledKeys.length * leftColWidth);
  const leftPad = leftAreaWidth + 12; // room for left columns
   const pad = 6;
  const w = totalW - 16;
  const innerW = w - leftPad - pad - 12; // right margin
   const innerH = height - pad*2;
  const plotOffsetX = 8; // additional offset to keep labels away from plot edge

  // compute global time range from enabled series (fallback to all)
  const enabledEntries = Object.entries(seriesPoints).filter(([k]) => enabled[k]);
  const allPointsForTime = (enabledEntries.length ? enabledEntries : Object.entries(seriesPoints)).flatMap(([,pts]) => pts);
  let tMin = allPointsForTime.length ? Math.min(...allPointsForTime.map(p=>p.t)) : Date.now() - 30_000;
  let tMax = allPointsForTime.length ? Math.max(...allPointsForTime.map(p=>p.t)) : Date.now();
  // ensure a non-zero time range (fallback to 5s window)
  if (tMax <= tMin) {
    tMax = tMin + 5000;
    tMin = tMax - 30000; // keep 30s window if possible
  }
  const tToX = (t:number) => leftPad + pad + plotOffsetX + ((t - tMin) / (tMax - tMin || 1)) * (innerW - plotOffsetX);

  // time ticks: left, mid, right
  const timeTicks = [tMin, Math.floor((tMin + tMax) / 2), tMax];
  const clampX = (x:number) => Math.min(Math.max(x, leftPad + pad), leftPad + pad + innerW);

  // per series scale functions and min/max values
  const seriesScale: Record<string, { vMin:number; vMax:number; vToY: (v:number)=>number }> = {};
  for (const s of seriesDefs) {
    const pts = seriesPoints[s.key] || [];
    const vMinRaw = pts.length ? Math.min(...pts.map(p=>p.v)) : 0;
    const vMaxRaw = pts.length ? Math.max(...pts.map(p=>p.v)) : (s.key === 'eng_f0' ? 7000 : (s.key === 'oil_temp' ? 100 : 200));
    // add a small margin (15%) to make lines breathe
    const range = vMaxRaw - vMinRaw;
    const margin = range > 0 ? Math.max(1, Math.abs(range) * 0.15) : 1;
    const adjMin = vMinRaw - margin;
    const adjMax = vMaxRaw + margin;
    seriesScale[s.key] = { vMin: adjMin, vMax: adjMax, vToY: (v:number) => pad + innerH - ((v - adjMin) / (adjMax - adjMin || 1)) * innerH };
  }

  return (
    <div ref={containerRef} className="space-y-2 w-full">
       <div className="flex items-center gap-3 flex-wrap">
        {seriesDefs.map(s => (
          <Button
            key={s.key}
            variant={enabled[s.key] ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEnabled(prev => ({ ...prev, [s.key]: !prev[s.key] }))}
            className="inline-flex items-center gap-2 px-2"
          >
            <span style={{ width: 10, height: 10, background: s.color, display: 'inline-block', borderRadius: 2 }} />
            <span className="text-xs text-muted-foreground">{s.label} <span className="text-[10px] text-muted-foreground">{s.unit}</span></span>
          </Button>
        ))}
      </div>

      <div className="bg-card border rounded-md p-2 overflow-hidden">
        <svg width={totalW} height={height}>
           {/* vertical grid lines */}
           {[0,0.25,0.5,0.75,1].map((f,i)=> (
             <line key={i} x1={leftPad+pad} x2={leftPad+pad+innerW} y1={pad + f*innerH} y2={pad + f*innerH} stroke="#0f172a20" strokeWidth={1} />
           ))}

          {/* left-column placeholders (labels are rendered later as colored value boxes) */}
          {enabledKeys.map(s => <g key={s.key} />)}

           {/* render each enabled series using its own scaling */}
          {enabledKeys.map(s => {
            const pts = seriesPoints[s.key] || [];
            if (pts.length === 0) return null;
            const sc = seriesScale[s.key];
            const d = pts.map((p,i)=> `${i===0?'M':'L'} ${tToX(p.t)} ${sc.vToY(p.v)}`).join(' ');
            return (
              <g key={s.key}>
                <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              </g>
            );
          })}

          {/* now render left-column colored value boxes (no titles) */}
          {enabledKeys.map((s, idx) => {
            const sc = seriesScale[s.key];
            const xBase = 8 + idx * leftColWidth;
            const rectW = leftColWidth - 20; // slightly narrower boxes for compressed appearance
            // positions: use safe fractions (5%, 50%, 95%) to avoid grid overlap
            const topY = pad + 0.05 * innerH;
            const midY = pad + 0.5 * innerH;
            const botY = pad + 0.95 * innerH;
            const vals = [sc.vMax, Math.round((sc.vMax + sc.vMin) / 2), sc.vMin];
            const ys = [topY, midY, botY];
            return (
              <g key={s.key}>
                {vals.map((val, ti) => (
                  <g key={ti}>
                    <rect x={xBase} y={ys[ti]-10} width={rectW} height={16} rx={3} fill="#111827" opacity={0.08} />
                    <text x={xBase + rectW - 6} y={ys[ti]} fontSize={10} fill={s.color} textAnchor="end">{Math.round(val)}</text>
                  </g>
                ))}
               </g>
             );
           })}

          {/* time ticks (left, mid, right) */}
          {timeTicks.map((tt, i) => {
            const xRaw = tToX(tt);
            const x = clampX(xRaw);
            const anchor = i === 0 ? 'start' : (i === 1 ? 'middle' : 'end');
            return <text key={i} x={x} y={height-4} fontSize={11} textAnchor={anchor} fill="#9CA3AF">{new Date(tt).toLocaleTimeString()}</text>
          })}
        </svg>
      </div>
    </div>
   );
 }
