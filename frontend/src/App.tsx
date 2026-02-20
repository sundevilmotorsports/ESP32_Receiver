import './App.css'
import {useEffect, useState} from "react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";

interface Telemetry {
    key: string;
    value: string;
}

interface TimingGate {
    mac: string;
    timestamp_us: number;
    diff_us: number;
}

function formatTime(us: number): string {
    if (us === 0) return "—";
    return (us / 1_000_000).toFixed(4) + "s";
}

function formatDelta(us: number): string {
    if (us === 0) return "—";
    const s = us / 1_000_000;
    return s.toFixed(4) + "s";
}

function App() {
    const [telemetry, setTelemetry] = useState<Telemetry[]>([]);
    const [gates, setGates] = useState<TimingGate[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            fetch("/telemetry")
                .then(r => r.json())
                .then(json => setTelemetry(json))
                .catch(() => {});

            fetch("/timing")
                .then(r => r.json())
                .then(json => setGates(json))
                .catch(() => {});
        };

        fetchData();
        const id = setInterval(fetchData, 500);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="min-h-screen bg-background p-8 space-y-6 max-w-3xl mx-auto">

            {/* Timing Gates */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        Timing Gates
                        <Badge variant="secondary">{gates.length}</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {gates.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No gates</p>
                    ) : (
                        <div className="space-y-3">
                            {gates.map((gate) => (
                                <div key={gate.mac} className="rounded-lg border p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-sm text-muted-foreground">{gate.mac}</span>
                                        <Badge variant="outline">Active</Badge>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Timestamp</p>
                                            <p className="text-xl font-semibold tabular-nums">{formatTime(gate.timestamp_us)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Delta</p>
                                            <p className="text-xl font-semibold tabular-nums text-green-500">{formatDelta(gate.diff_us)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Telemetry */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        Telemetry
                        <Badge variant="secondary">{telemetry.length}</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {telemetry.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No telemetry data</p>
                    ) : (
                        <div className="divide-y">
                            {telemetry.map((t) => (
                                <div key={t.key} className="flex justify-between py-2 text-sm">
                                    <span className="text-muted-foreground font-mono">{t.key}</span>
                                    <span className="font-medium">{t.value}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default App;