import './App.css'
import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { GatesPanel } from "@/components/GatesPanel";
import { TelemetryPanel } from "@/components/TelemetryPanel";
import type { GateConfig, GateRow, TimingGate, Telemetry } from "@/lib/types";
import { FAKE_CONFIGS, generateFakeGates, generateFakeTelemetry } from "@/lib/types";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import {Button} from "@/components/ui/button.tsx";
import {Input} from "@/components/ui/input.tsx";

function buildGroups(configs: GateConfig[], gates: TimingGate[]): Record<string, GateRow[]> {
  const sorted = [...configs].sort((a, b) => a.order - b.order);
  const groups: Record<string, GateRow[]> = {};
  for (const cfg of sorted) {
    const key = cfg.group || `__solo__${cfg.mac}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ config: cfg, gate: gates.find(g => g.mac === cfg.mac) ?? null });
  }
  for (const gate of gates) {
    if (!configs.find(c => c.mac === gate.mac)) {
      const key = `__solo__${gate.mac}`;
      if (!groups[key]) groups[key] = [{ config: { mac: gate.mac, mode: "delta", group: "", order: 999 }, gate }];
    }
  }
  return groups;
}

function App() {
  const [gates, setGates] = useState<TimingGate[]>([]);
  const [configs, setConfigs] = useState<GateConfig[]>([]);
  const [telemetry, setTelemetry] = useState<Telemetry[]>([]);
  const fake = false;

  const fetchConfigs = () =>
    fetch("/gate-config").then(r => r.json()).then(setConfigs).catch(() => {});

  const postConfig = (cfg: GateConfig): Promise<void> =>
    fetch("/gate-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    }).then(() => {});

  const save = (cfg: GateConfig): Promise<void> => {
    if (fake) {
      setConfigs(prev =>
        prev.some(c => c.mac === cfg.mac)
          ? prev.map(c => c.mac === cfg.mac ? cfg : c)
          : [...prev, cfg]
      );
      return Promise.resolve();
    }
    return postConfig(cfg).then(fetchConfigs);
  };

  const swapOrder = (a: GateConfig, b: GateConfig): void => {
    if (fake) {
      setConfigs(prev => prev.map(c => {
        if (c.mac === a.mac) return { ...c, order: b.order };
        if (c.mac === b.mac) return { ...c, order: a.order };
        return c;
      }));
      return;
    }
    postConfig({ ...a, order: b.order })
      .then(() => postConfig({ ...b, order: a.order }))
      .then(fetchConfigs);
  };

  useEffect(() => {
    if (fake) {
      setConfigs(FAKE_CONFIGS);
      const id = setInterval(() => {
        setGates(generateFakeGates());
        setTelemetry(generateFakeTelemetry());
      }, 500);
      return () => clearInterval(id);
    } else {
      fetchConfigs();
      const id = setInterval(() => {
        fetch("/timing").then(r => r.json()).then((newGates: TimingGate[]) => {
          setGates(newGates);
          setConfigs(prev => {
            const toRegister = newGates.filter(g => !prev.find(c => c.mac === g.mac));
            if (toRegister.length === 0) return prev;
            const next = [...prev];
            for (const g of toRegister) {
              const newCfg: GateConfig = { mac: g.mac, mode: "delta", group: "", order: next.length };
              next.push(newCfg);
              postConfig(newCfg).then(fetchConfigs);
            }
            return next;
          });
        }).catch(() => {});
        fetch("/telemetry").then(r => r.json()).then(setTelemetry).catch(() => {});
      }, 500);
      return () => clearInterval(id);
    }
  }, [fake]);

  const telemMap = Object.fromEntries(telemetry.map(t => [t.key, t.value]));
  const groups = buildGroups(configs, gates);

  const [loggerName, setLoggerName] = useState<string>("");

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="flex items-center gap-3 px-6 py-3 border-b shrink-0">
        <span className="font-semibold">SDM Telemetry</span>
        <Button
          variant="outline"
          onClick={() => window.open("/timing/export.csv", "_blank")}
        >Export Timing</Button>

        <Input placeholder="Logger Name" className="max-w-48"
               onKeyDown={e => e.key === "Enter" && setLoggerName((e.target as HTMLInputElement).value)}
               onBlur={e => setLoggerName(e.target.value)} />
        <Button size="sm" variant="outline"
                onClick={() => fetch("/loggername", { method: "POST", body: loggerName })}>Set</Button>

        <div className="ml-auto">
          <ThemeToggle />
        </div>

      </header>

      <main className="flex flex-1 gap-6 p-6 overflow-hidden">
        <aside className="flex flex-col gap-3 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Timing Gates</p>
          <GatesPanel groups={groups} allConfigs={configs} onSave={save} onSwap={swapOrder} />
        </aside>

        <Separator orientation="vertical" />

        <section className="flex-1 flex flex-col gap-3 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Telemetry</p>
          <TelemetryPanel telemMap={telemMap} />
        </section>
      </main>
    </div>
  );
}

export default App;