import './App.css'
import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { GatesPanel } from "@/components/GatesPanel";
import { TelemetryPanel } from "@/components/TelemetryPanel";
import type { GateConfig, GateRow, TimingGate, Telemetry } from "@/lib/types";
import { FAKE_CONFIGS, generateFakeGates, generateFakeTelemetry } from "@/lib/types";
import { ThemeToggle } from "@/components/theme-toggle.tsx";

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
  const fake = true;

  const fetchConfigs = () =>
    fetch("/gate-config").then(r => r.json()).then(setConfigs).catch(() => {});

  const save = (cfg: GateConfig): Promise<void> => {
    if (fake) {
      setConfigs(prev =>
        prev.some(c => c.mac === cfg.mac)
          ? prev.map(c => c.mac === cfg.mac ? cfg : c)
          : [...prev, cfg]
      );
      return Promise.resolve();
    }
    return fetch("/gate-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    }).then(fetchConfigs);
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
        fetch("/timing").then(r => r.json()).then(setGates).catch(() => {});
        fetch("/telemetry").then(r => r.json()).then(setTelemetry).catch(() => {});
      }, 500);
      return () => clearInterval(id);
    }
  }, [fake]);

  const telemMap = Object.fromEntries(telemetry.map(t => [t.key, t.value]));
  const groups = buildGroups(configs, gates);

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="flex items-center gap-3 px-6 py-3 border-b shrink-0">
        <span className="font-semibold">SDM Telemetry</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 gap-6 p-6 overflow-hidden">
        <aside className="flex flex-col gap-3 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Timing Gates</p>
          <GatesPanel groups={groups} onSave={save} />
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