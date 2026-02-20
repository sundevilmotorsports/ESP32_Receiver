import './App.css'
import {useEffect, useState} from "react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Separator} from "@/components/ui/separator";

interface Telemetry { key: string; value: string; }
interface TimingGate { mac: string; timestamp_us: number; diff_us: number; }

const fmt = (us: number) => us === 0 ? "—" : (us / 1_000_000).toFixed(4) + "s";

function App() {
    const [telemetry, setTelemetry] = useState<Telemetry[]>([]);
    const [gates, setGates] = useState<TimingGate[]>([]);

    useEffect(() => {
        const fetchData = () => {
            fetch("/telemetry").then(r => r.json()).then(setTelemetry).catch(() => {});
            fetch("/timing").then(r => r.json()).then(setGates).catch(() => {});
        };
        fetchData();
        const id = setInterval(fetchData, 500);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="max-w-xl mx-auto p-6 space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Timing Gates <Badge variant="secondary">{gates.length}</Badge></CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {gates.length === 0 ? <p className="text-sm text-muted-foreground">No gates detected</p> : gates.map((gate, i) => (
                        <div key={gate.mac} className="border rounded-lg p-3 space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-sm">Gate {i + 1} <code className="text-muted-foreground">{gate.mac}</code></span>
                                <Badge variant="outline">Active</Badge>
                            </div>
                            <div className="grid grid-cols-2">
                                <div>
                                    <p className="text-xs text-muted-foreground">Timestamp</p>
                                    <p className="text-lg font-semibold">{fmt(gate.timestamp_us)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Delta</p>
                                    <p className="text-lg font-semibold text-primary">{fmt(gate.diff_us)}</p>
                                </div>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => fetch('/ident', {method: 'POST', body: gate.mac})}>Identify</Button>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Telemetry <Badge variant="secondary">{telemetry.length}</Badge></CardTitle>
                </CardHeader>
                <CardContent>
                    {telemetry.length === 0 ? <p className="text-sm text-muted-foreground">No telemetry data</p> : telemetry.map((t, i) => (
                        <div key={t.key}>
                            <div className="flex justify-between py-2 text-sm">
                                <code className="text-muted-foreground">{t.key}</code>
                                <span>{t.value}</span>
                            </div>
                            {i < telemetry.length - 1 && <Separator/>}
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}

export default App;