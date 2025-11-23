"use client";

import {useEffect, useState} from "react";
import {setInterval} from "timers";
import {Card, CardContent, CardHeader} from "@/components/ui/card";

interface TimingGate {
  macaddr: string;
  timestamp: string;
}

interface GatesResponse {
  gates: TimingGate[];
}

export default function Home() {
  const [gates, setGates] = useState<TimingGate[] | null>(null);

  useEffect(() => {
    const fetchGates = async () => {
      try {
        const res = await fetch("http://192.168.4.1:3000/gates");
        if (res.ok) {
          const json: GatesResponse = await res.json();
          setGates(json.gates);
        }
      } catch (error) {
        console.error("Failed to fetch gates:", error);
      }
    }

    fetchGates();
    const interval = setInterval(fetchGates, 250);

    return () => {
      clearInterval(interval);
    };
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black space-x-6">
      {gates && gates.map((gate) => (
          <Card key={gate.macaddr}>
            <CardHeader>{gate.macaddr}</CardHeader>
            <CardContent>{gate.timestamp}</CardContent>
          </Card>
      ))}
    </div>
  );
}
