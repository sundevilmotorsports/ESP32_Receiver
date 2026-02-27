import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { GateConfig, GateRow } from "@/lib/types";
import { fmt, fmtDiff } from "@/lib/types";

interface Props { groups: Record<string, GateRow[]>; allConfigs: GateConfig[]; onSave: (cfg: GateConfig) => void; onSwap: (a: GateConfig, b: GateConfig) => void; }

export function GatesPanel({ groups, allConfigs, onSave, onSwap }: Props) {
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
                // Find position in the global order so ↑/↓ can cross group boundaries
                const globalIdx = globalOrder.findIndex(c => c.mac === row.config.mac);
                const prevGlobal = globalIdx > 0 ? globalOrder[globalIdx - 1] : null;
                const nextGlobal = globalIdx >= 0 && globalIdx < globalOrder.length - 1 ? globalOrder[globalIdx + 1] : null;

                // Within a series group, prefer in-group neighbours for the split-time display,
                // but always use global neighbours for the actual swap target.
                return (
                <div key={row.config.mac} className="space-y-2">                  {isSeries && idx > 0 && (
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
                      <div className="flex items-center justify-between">
                        <code className="text-xs text-muted-foreground">{row.config.mac}</code>
                        <div className="flex gap-3 text-sm font-mono">
                          <span className="text-muted-foreground">{fmt(row.gate?.timestamp_us ?? 0)}</span>
                          <span className="text-primary font-bold">{fmt(row.gate?.diff_us ?? 0)}</span>
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
