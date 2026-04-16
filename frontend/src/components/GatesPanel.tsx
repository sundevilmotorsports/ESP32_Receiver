import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { GateConfig, GateRow } from "@/lib/types";
import { fmt, fmtDiff } from "@/lib/types";

type GateDeltaHistory = Record<string, { diff_us: number; t: number }[]>;

interface Props {
  groups: Record<string, GateRow[]>;
  allConfigs: GateConfig[];
  onSave: (cfg: GateConfig) => void;
  onSwap: (a: GateConfig, b: GateConfig) => void;
  gateHistory?: GateDeltaHistory;
}

function DeltaHistory({ entries }: { entries: { diff_us: number; t: number }[] }) {
  if (!entries.length) return null;

  const values = entries.map(e => e.diff_us);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // sparkline dimensions
  const W = 120, H = 28, PAD = 2;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const pts = entries.map((e, i) => {
    const x = PAD + (i / Math.max(entries.length - 1, 1)) * innerW;
    const y = PAD + innerH - ((e.diff_us - min) / range) * innerH;
    return `${x},${y}`;
  });

  const last = entries[entries.length - 1];
  const best = entries.reduce((a, b) => a.diff_us < b.diff_us ? a : b);

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Last {entries.length} deltas</span>
        <span className="text-xs text-muted-foreground">
          best <span className="text-green-500 font-mono">{fmt(best.diff_us)}</span>
        </span>
      </div>
      {/* sparkline */}
      <svg width={W} height={H} className="w-full">
        <polyline
          points={pts.join(' ')}
          fill="none"
          stroke="#60a5fa"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* dot on last point */}
        {entries.length > 0 && (() => {
          const lastPt = pts[pts.length - 1].split(',');
          return <circle cx={lastPt[0]} cy={lastPt[1]} r={2.5} fill="#60a5fa" />;
        })()}
      </svg>
      {/* scrollable history list — newest first */}
      <div className="max-h-32 overflow-y-auto space-y-0.5">
        {[...entries].reverse().map((e, i) => (
          <div key={i} className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground tabular-nums">
              {new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span
              className="font-mono tabular-nums"
              style={{ color: e.diff_us === best.diff_us ? '#10b981' : e.diff_us === last.diff_us ? '#60a5fa' : undefined }}
            >
              {fmt(e.diff_us)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GatesPanel({ groups, allConfigs, onSave, onSwap, gateHistory = {} }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!Object.keys(groups).length)
    return <p className="text-sm text-muted-foreground text-center py-8">No gates detected</p>;

  const globalOrder = [...allConfigs].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-3">
      {Object.entries(groups).map(([groupKey, rows]) => {
        const isSeries = rows.length > 1 && rows[0].config.mode === "series";
        const label = groupKey.startsWith("__solo__") ? "Gate" : groupKey;
        const first = rows[0].gate?.timestamp_us ?? 0;
        const last  = rows[rows.length - 1].gate?.timestamp_us ?? 0;

        return (
          <Card key={groupKey}>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <CardTitle className="text-sm">{label}</CardTitle>
              {isSeries && <Badge variant="secondary">Series</Badge>}
              {isSeries && <span className="ml-auto font-mono text-sm font-semibold">{fmtDiff(first, last)}</span>}
            </CardHeader>
            <CardContent className="space-y-3">
              {rows.map((row, idx) => {
                const globalIdx = globalOrder.findIndex(c => c.mac === row.config.mac);
                const prevGlobal = globalIdx > 0 ? globalOrder[globalIdx - 1] : null;
                const nextGlobal = globalIdx >= 0 && globalIdx < globalOrder.length - 1 ? globalOrder[globalIdx + 1] : null;
                const hist = gateHistory[row.config.mac] ?? [];
                const showHist = expanded[row.config.mac] ?? false;

                return (
                  <div key={row.config.mac} className="space-y-2">
                    {isSeries && idx > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs font-mono text-primary">+{fmtDiff(rows[idx - 1].gate?.timestamp_us ?? 0, row.gate?.timestamp_us ?? 0)}</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col gap-1 pt-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6"
                          onClick={() => { if (prevGlobal) onSwap(row.config, prevGlobal); }}
                          disabled={!prevGlobal}>↑</Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6"
                          onClick={() => { if (nextGlobal) onSwap(row.config, nextGlobal); }}
                          disabled={!nextGlobal}>↓</Button>
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <code className="text-xs text-muted-foreground shrink-0">{row.config.mac.split(':').slice(-4).join(':')}</code>
                          <div className="flex gap-3 items-center text-sm font-mono min-w-0">
                            {row.gate?.stuck && (
                              <Badge variant="destructive" className="animate-pulse text-xs px-1.5 py-0">STUCK</Badge>
                            )}
                            <span className="text-muted-foreground">{fmt(row.gate?.timestamp_us ?? 0)}</span>
                            <span className="text-primary font-bold">{fmt(row.gate?.diff_us ?? 0)}</span>
                            {hist.length > 0 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 px-1 text-xs text-muted-foreground"
                                onClick={() => setExpanded(e => ({ ...e, [row.config.mac]: !showHist }))}
                              >
                                {showHist ? 'hide' : `history (${hist.length})`}
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Select value={row.config.mode} onValueChange={v => onSave({ ...row.config, mode: v as "delta" | "series" })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="delta">Delta</SelectItem>
                              <SelectItem value="series">Series</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input placeholder="Group" className="flex-1"
                            defaultValue={row.config.group} key={row.config.group + row.config.mac}
                            onKeyDown={e => e.key === "Enter" && onSave({ ...row.config, group: (e.target as HTMLInputElement).value })}
                            onBlur={e => onSave({ ...row.config, group: e.target.value })} />
                          <Button size="sm" variant="outline"
                            onClick={() => fetch("/ident", { method: "POST", body: row.config.mac })}>Ident</Button>
                        </div>
                        {showHist && <DeltaHistory entries={hist} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
