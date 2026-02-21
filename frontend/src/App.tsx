import './App.css'
import {useEffect, useState} from "react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Separator} from "@/components/ui/separator";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Input} from "@/components/ui/input";

interface TimingGate {
  mac: string;
  timestamp_us: number;
  diff_us: number;
}

interface GateConfig {
  mac: string;
  mode: "delta" | "series";
  group: string;
  order: number;
}

interface GateRow {
  config: GateConfig;
  gate: TimingGate | null;
}

interface Telemetry {
  key: string;
  value: string;
}

const fmt = (us: number) => us === 0 ? "—" : (us / 1e6).toFixed(3) + "s";
const diff = (a: number, b: number) => (a === 0 || b === 0) ? "—" : ((b - a) / 1e6).toFixed(3) + "s";

function App() {
  const [gates, setGates] = useState<TimingGate[]>([]);
  const [configs, setConfigs] = useState<GateConfig[]>([]);
  const [telemetry, setTelemetry] = useState<Telemetry[]>([]);

  const fetchConfigs = () => fetch("/gate-config").then(r => r.json()).then(setConfigs).catch(() => {
  });

  const save = (cfg: GateConfig) =>
    fetch("/gate-config", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(cfg)})
      .then(fetchConfigs);

  const move = (cfg: GateConfig, groupRows: GateRow[], dir: -1 | 1) => {
    const idx = groupRows.findIndex(r => r.config.mac === cfg.mac);
    const swap = groupRows[idx + dir];
    if (!swap) return;
    save({...cfg, order: swap.config.order});
    save({...swap.config, order: cfg.order});
  };

  useEffect(() => {
    fetchConfigs();
    const id = setInterval(() => {
      fetch("/timing").then(r => r.json()).then(setGates).catch(() => {
      });

      fetch("/telemetry").then(r => r.json()).then(setTelemetry).catch(() => {
      });
    }, 500);
    return () => clearInterval(id);
  }, []);

  // Sort configs by order, group them
  const sorted = [...configs].sort((a, b) => a.order - b.order);
  const groups: Record<string, GateRow[]> = {};
  for (const cfg of sorted) {
    const key = cfg.group || `__solo__${cfg.mac}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push({config: cfg, gate: gates.find(g => g.mac === cfg.mac) ?? null});
  }
  // also add gates that have no config yet
  for (const gate of gates) {
    if (!configs.find(c => c.mac === gate.mac)) {
      const key = `__solo__${gate.mac}`;
      if (!groups[key]) groups[key] = [{config: {mac: gate.mac, mode: "delta", group: "", order: 999}, gate}];
    }
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-3">
      {Object.entries(groups).map(([groupKey, rows]) => {
        const isSeries = rows.length > 1 && rows[0].config.mode === "series";
        const label = groupKey.startsWith("__solo__") ? null : groupKey;
        const seriesGates = isSeries ? rows.map(r => r.gate) : [];
        const first = seriesGates[0]?.timestamp_us ?? 0;
        const last = seriesGates[seriesGates.length - 1]?.timestamp_us ?? 0;

        return (
          <Card key={groupKey}>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                {label ?? <span className="text-muted-foreground font-mono text-xs">{rows[0].config.mac}</span>}
                {isSeries && <Badge variant="secondary">Series</Badge>}
                {isSeries && <span className="ml-auto text-xs text-muted-foreground">Total: {diff(first, last)}</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              {rows.map((row, idx) => (
                <div key={row.config.mac}>
                  {isSeries && idx > 0 && (
                    <div className="text-center text-xs text-muted-foreground py-1">
                      ↕ {diff(rows[idx - 1].gate?.timestamp_us ?? 0, row.gate?.timestamp_us ?? 0)}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-1">
                      <Button size="sm" variant="ghost" className="h-4 w-4 p-0 text-xs"
                              onClick={() => move(row.config, rows, -1)} disabled={idx === 0}>↑</Button>
                      <Button size="sm" variant="ghost" className="h-4 w-4 p-0 text-xs"
                              onClick={() => move(row.config, rows, 1)} disabled={idx === rows.length - 1}>↓</Button>
                    </div>
                    <div className="flex-1 border rounded p-2 space-y-1">
                      <div className="flex justify-between items-center">
                        <code className="text-xs text-muted-foreground">{row.config.mac}</code>
                        <div className="flex gap-2 text-xs">
                          <span className="text-muted-foreground">{fmt(row.gate?.timestamp_us ?? 0)}</span>
                          <span className="text-primary font-medium">{fmt(row.gate?.diff_us ?? 0)}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Select value={row.config.mode}
                                onValueChange={v => save({...row.config, mode: v as "delta" | "series"})}>
                          <SelectTrigger className="h-6 w-32 text-xs">
                            <SelectValue/>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="delta">Delta</SelectItem>
                            <SelectItem value="series">Series</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          className="h-6 text-xs"
                          placeholder="Group"
                          defaultValue={row.config.group}
                          key={row.config.group + row.config.mac}
                          onKeyDown={e => e.key === "Enter" && save({
                            ...row.config,
                            group: (e.target as HTMLInputElement).value
                          })}
                          onBlur={e => save({...row.config, group: e.target.value})}
                        />
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2 shrink-0"
                                onClick={() => fetch('/ident', {method: 'POST', body: row.config.mac})}>Ident</Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
            {label && <><Separator/>
                <div className="px-4 py-2 text-xs text-muted-foreground">Group: {label}</div>
            </>}
          </Card>
        );
      })}
      {Object.keys(groups).length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No gates detected</p>
      )}

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm">Telemetry</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-2">
          {telemetry.map(t => (
            <div key={t.key} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t.key}</span>
              <span className="font-medium">{t.value}</span>
            </div>
          ))}
          {telemetry.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No telemetry data</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default App;