import './App.css'
import {useEffect, useState} from "react";
import {Card, CardContent, CardHeader} from "@/components/ui/card.tsx";

interface Telemetry {
    key: string;
    value: string;
}

interface TimingGate {
    mac_addr: string;
    timestamp: string;
    time_delta: string;
}

function App() {
    //@ts-ignore
    const [telemetry, setTelemetry] = useState<Telemetry[]>([]);
    const [gates, setGates] = useState<TimingGate[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            fetch("http://localhost:3000/telemetry").then(data => data.json().then(json => setTelemetry(json)));
            fetch("http://localhost:3000/timing").then(data => data.json().then(json => setGates(json)));
        };

        const intervalId = setInterval(async () => {
            await fetchData();
        }, 500);

        return () => {
            clearInterval(intervalId);
        };
    }, []);

    return (
        <div className="flex min-h-svh flex-col items-center justify-center">
            <Card>
                <CardHeader>Gates</CardHeader>
                <CardContent>
                    {gates.map((data) => (
                        <p>{`${data.mac_addr} delta: ${data.time_delta} timestamp: ${data.timestamp}`}</p>
                    ))}
                </CardContent>
            </Card>
        </div>
    )
}

export default App
