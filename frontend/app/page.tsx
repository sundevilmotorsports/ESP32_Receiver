"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Timer, Zap, Clock } from "lucide-react";

interface TimingGate {
  macaddr: string;
  timestamp: string;
  time_delta: string;
}

interface GatesResponse {
  gates: TimingGate[];
}

interface ProcessedGate extends TimingGate {
  id: number;
  formattedTime: string;
  deltaFromPrevious?: number;
  timeSinceLastTrigger: number;
  isLatest: boolean;
  customOrder: number;
}

export default function HomePage() {
  const [gates, setGates] = useState<TimingGate[] | null>(null);
  const [processedGates, setProcessedGates] = useState<ProcessedGate[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [gateOrder, setGateOrder] = useState<string[]>([]);
  const [selectedGates, setSelectedGates] = useState<string[]>([]);
  const [customDeltas, setCustomDeltas] = useState<{from: string, to: string, delta: number}[]>([]);

  useEffect(() => {
    const fetchGates = async () => {
      try {
        const res = await fetch("http://192.168.4.1:3000/gates");
        if (res.ok) {
          const json: GatesResponse = await res.json();
          setGates(json.gates);
          setIsConnected(true);
        } else {
          setIsConnected(false);
        }
      } catch (error) {
        console.error("Failed to fetch gates:", error);
        setIsConnected(false);
      }
    };

    fetchGates();
    const interval = setInterval(fetchGates, 250);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (gates) {
      // Create a map of existing gate order
      const existingOrder = new Map(gateOrder.map((mac, idx) => [mac, idx]));

      // Add new gates to order that aren't already tracked
      const newMacs = gates.map(g => g.macaddr).filter(mac => !existingOrder.has(mac));
      const updatedOrder = [...gateOrder, ...newMacs];
      setGateOrder(updatedOrder);

      // Sort gates by custom order or timestamp
      const sortedGates = [...gates].sort((a, b) => {
        const aOrder = updatedOrder.indexOf(a.macaddr);
        const bOrder = updatedOrder.indexOf(b.macaddr);

        if (aOrder !== -1 && bOrder !== -1) {
          return aOrder - bOrder;
        }
        // Fallback to timestamp sorting
        return parseInt(a.timestamp) - parseInt(b.timestamp);
      });

      const processed: ProcessedGate[] = sortedGates.map((gate, index) => {
        const timeDelta = parseFloat(gate.time_delta); // Now in seconds
        const timestamp = parseInt(gate.timestamp);

        // Format the time delta in a readable way
        const formattedTimeDelta = formatDelta(timeDelta);

        // Calculate time between consecutive gate triggers in custom order
        let deltaFromPrevious: number | undefined;
        if (index > 0) {
          const prevTimestamp = parseInt(sortedGates[index - 1].timestamp);
          deltaFromPrevious = (timestamp - prevTimestamp) / 1000; // Convert to seconds
        }

        return {
          ...gate,
          id: index + 1,
          formattedTime: formattedTimeDelta,
          deltaFromPrevious,
          timeSinceLastTrigger: timeDelta,
          isLatest: index === sortedGates.length - 1,
          customOrder: updatedOrder.indexOf(gate.macaddr)
        };
      });

      setProcessedGates(processed);
    }
  }, [gates, gateOrder]);

  const formatDelta = (delta: number): string => {
    if (delta < 1) {
      return `${(delta * 1000).toFixed(0)}ms`;
    }
    return `${delta.toFixed(3)}s`;
  };

  const moveGate = (fromIndex: number, toIndex: number) => {
    const newOrder = [...gateOrder];
    const [movedItem] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, movedItem);
    setGateOrder(newOrder);
  };

  const toggleGateSelection = (macaddr: string) => {
    setSelectedGates(prev => {
      if (prev.includes(macaddr)) {
        return prev.filter(mac => mac !== macaddr);
      } else {
        return [...prev, macaddr];
      }
    });
  };

  // Automatically calculate deltas when selected gates change
  useEffect(() => {
    if (selectedGates.length >= 2) {
      calculateCustomDeltas();
    } else {
      setCustomDeltas([]);
    }
  }, [selectedGates, processedGates]);

  const calculateCustomDeltas = () => {
    if (selectedGates.length < 2) return [];

    const selectedProcessedGates = processedGates.filter(gate =>
      selectedGates.includes(gate.macaddr)
    ).sort((a, b) => selectedGates.indexOf(a.macaddr) - selectedGates.indexOf(b.macaddr));

    const deltas: {from: string, to: string, delta: number}[] = [];

    for (let i = 0; i < selectedProcessedGates.length - 1; i++) {
      const fromGate = selectedProcessedGates[i];
      const toGate = selectedProcessedGates[i + 1];

      // Calculate time difference based on server timestamps (milliseconds to seconds)
      const timeDiff = (parseInt(toGate.timestamp) - parseInt(fromGate.timestamp)) / 1000;

      deltas.push({
        from: fromGate.macaddr,
        to: toGate.macaddr,
        delta: timeDiff
      });
    }

    setCustomDeltas(deltas);
    return deltas;
  };

  const getActivityColor = (timeSince: number) => {
    if (timeSince < 1) return 'green'; // Very recent
    if (timeSince < 10) return 'yellow'; // Recent
    if (timeSince < 60) return 'orange'; // Moderate
    return 'red'; // Old
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-light text-slate-900 dark:text-slate-100 mb-2">
            Timing Gate Monitor
          </h1>
          <div className="flex items-center justify-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Stats Overview */}
        {processedGates.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Active Gates</p>
                    <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {processedGates.length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <Timer className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Most Recent Trigger</p>
                    <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {(() => {
                        const mostRecent = processedGates.reduce((min, gate) =>
                          gate.timeSinceLastTrigger < min ? gate.timeSinceLastTrigger : min,
                          Infinity
                        );
                        return mostRecent !== Infinity ? formatDelta(mostRecent) : 'N/A';
                      })()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Avg Time Between Gates</p>
                    <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {processedGates.length > 1 ? (() => {
                        const deltas = processedGates.filter(g => g.deltaFromPrevious).map(g => g.deltaFromPrevious!);
                        const avg = deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length;
                        return formatDelta(avg);
                      })() : 'N/A'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <Timer className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Fastest Gate Sequence</p>
                    <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                      {processedGates.length > 1 ? (() => {
                        const deltas = processedGates.filter(g => g.deltaFromPrevious).map(g => g.deltaFromPrevious!);
                        return formatDelta(Math.min(...deltas));
                      })() : 'N/A'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Gates Timeline */}
        <div className="space-y-4">
          {processedGates.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center">
                <Timer className="w-8 h-8 text-slate-500 dark:text-slate-400" />
              </div>
              <p className="text-lg text-slate-600 dark:text-slate-400">
                Waiting for timing gates...
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">
                Gates will appear here as they are triggered
              </p>
            </div>
          ) : (
            <>
              {/* Gate Management Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Gate Ordering */}
                <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-0 shadow-lg">
                  <CardContent className="p-6">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
                      Gate Order Management
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                      Use ↑/↓ buttons to reorder gates for sequence timing calculations
                    </p>
                    <div className="space-y-2">
                      {gateOrder.map((macaddr, orderIndex) => {
                        const gate = processedGates.find(g => g.macaddr === macaddr);
                        if (!gate) return null;

                        const color = getActivityColor(gate.timeSinceLastTrigger);

                        return (
                          <div
                            key={gate.macaddr}
                            className={`
                              flex items-center justify-between p-3 rounded-lg border transition-all
                              ${selectedGates.includes(gate.macaddr) 
                                ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800 ring-1 ring-blue-300' 
                                : 'bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:border-slate-700'
                              }
                              cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50
                            `}
                            onClick={() => toggleGateSelection(gate.macaddr)}
                          >
                            <div className="flex items-center space-x-3">
                              <div className={`
                                w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white
                                ${color === 'green' ? 'bg-green-500' : 
                                  color === 'yellow' ? 'bg-yellow-500' : 
                                  color === 'orange' ? 'bg-orange-500' : 'bg-red-500'}
                              `}>
                                {orderIndex + 1}
                              </div>
                              <div>
                                <p className="font-mono text-sm text-slate-900 dark:text-slate-100">
                                  {gate.macaddr.toUpperCase()}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {formatDelta(gate.timeSinceLastTrigger)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              {orderIndex > 0 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveGate(orderIndex, orderIndex - 1);
                                  }}
                                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-slate-600 dark:text-slate-400"
                                >
                                  ↑
                                </button>
                              )}
                              {orderIndex < gateOrder.length - 1 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveGate(orderIndex, orderIndex + 1);
                                  }}
                                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-slate-600 dark:text-slate-400"
                                >
                                  ↓
                                </button>
                              )}
                              <input
                                type="checkbox"
                                checked={selectedGates.includes(gate.macaddr)}
                                onChange={() => toggleGateSelection(gate.macaddr)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-4 h-4"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Custom Delta Calculation */}
                <Card className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-0 shadow-lg">
                  <CardContent className="p-6">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
                      Time Delta Analysis
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                      Select gates to compare timing differences
                    </p>

                    {/* Quick select buttons */}
                    <div className="mb-6 flex flex-wrap gap-2">
                      <button
                        onClick={() => setSelectedGates(gateOrder.slice())}
                        className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => setSelectedGates([])}
                        className="px-3 py-1 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300"
                      >
                        Clear All
                      </button>
                      <button
                        onClick={() => setSelectedGates(gateOrder.slice(0, 2))}
                        disabled={gateOrder.length < 2}
                        className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50 dark:bg-green-900/30 dark:text-green-400"
                      >
                        First Two
                      </button>
                      <button
                        onClick={() => setSelectedGates(gateOrder.slice(-2))}
                        disabled={gateOrder.length < 2}
                        className="px-3 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:opacity-50 dark:bg-purple-900/30 dark:text-purple-400"
                      >
                        Last Two
                      </button>
                    </div>

                    {selectedGates.length === 0 && (
                      <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                        <Timer className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>Select gates to see timing analysis</p>
                      </div>
                    )}

                    {selectedGates.length > 0 && (
                      <div className="space-y-4">
                        {/* Selected Gates Display */}
                        <div className="grid gap-3">
                          {selectedGates.map((macaddr, index) => {
                            const gate = processedGates.find(g => g.macaddr === macaddr);
                            if (!gate) return null;

                            const orderIndex = gateOrder.indexOf(macaddr);
                            const color = getActivityColor(gate.timeSinceLastTrigger);
                            const isFirst = index === 0;
                            const isLast = index === selectedGates.length - 1;

                            return (
                              <div key={macaddr} className="relative">
                                {/* Connection line to next gate */}
                                {!isLast && (
                                  <div className="absolute left-6 top-16 w-0.5 h-6 bg-gradient-to-b from-blue-400 to-blue-600 z-10" />
                                )}

                                <div className={`
                                  flex items-center justify-between p-4 rounded-lg border-2 transition-all
                                  ${isFirst ? 'border-green-300 bg-green-50 dark:bg-green-950/20 dark:border-green-700' :
                                    isLast ? 'border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-700' :
                                    'border-blue-300 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-700'
                                  }
                                `}>
                                  <div className="flex items-center space-x-3">
                                    <div className={`
                                      w-10 h-10 rounded-full flex items-center justify-center font-semibold text-white text-sm
                                      ${isFirst ? 'bg-green-500' : isLast ? 'bg-red-500' : 'bg-blue-500'}
                                    `}>
                                      {orderIndex + 1}
                                    </div>
                                    <div>
                                      <p className="font-mono text-sm text-slate-900 dark:text-slate-100">
                                        {macaddr.slice(-8).toUpperCase()}
                                      </p>
                                      <p className="text-xs text-slate-600 dark:text-slate-400">
                                        {isFirst ? 'Start Gate' : isLast ? 'End Gate' : `Gate ${index + 1}`}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-4">
                                    <div className="text-right">
                                      <p className="text-xs text-slate-600 dark:text-slate-400">Time Delta</p>
                                      <p className={`
                                        font-mono text-sm px-2 py-1 rounded
                                        ${color === 'green' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                          color === 'yellow' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                          color === 'orange' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' :
                                          'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                        }
                                      `}>
                                        {formatDelta(gate.timeSinceLastTrigger)}
                                      </p>
                                    </div>

                                    {!isLast && customDeltas[index] && (
                                      <>
                                        <div className="w-px h-8 bg-slate-300 dark:bg-slate-600" />
                                        <div className="text-right">
                                          <p className="text-xs text-slate-600 dark:text-slate-400">Time to Next</p>
                                          <p className={`
                                            font-mono text-sm px-2 py-1 rounded font-semibold
                                            ${Math.abs(customDeltas[index].delta) < 1 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                              Math.abs(customDeltas[index].delta) < 5 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                                              'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                                            }
                                          `}>
                                            {customDeltas[index].delta >= 0 ? '+' : ''}{formatDelta(Math.abs(customDeltas[index].delta))}
                                          </p>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Summary Statistics */}
                        {customDeltas.length > 0 && (
                          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                              <div className="text-center">
                                <p className="text-sm text-blue-700 dark:text-blue-300 mb-1">Total Time</p>
                                <p className="font-mono text-xl font-semibold text-blue-900 dark:text-blue-100">
                                  {(() => {
                                    const total = customDeltas.reduce((sum, delta) => sum + delta.delta, 0);
                                    return formatDelta(Math.abs(total));
                                  })()}
                                </p>
                              </div>
                            </div>

                            <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                              <div className="text-center">
                                <p className="text-sm text-green-700 dark:text-green-300 mb-1">Fastest Split</p>
                                <p className="font-mono text-xl font-semibold text-green-900 dark:text-green-100">
                                  {formatDelta(Math.min(...customDeltas.map(d => Math.abs(d.delta))))}
                                </p>
                              </div>
                            </div>

                            <div className="p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
                              <div className="text-center">
                                <p className="text-sm text-purple-700 dark:text-purple-300 mb-1">Average Split</p>
                                <p className="font-mono text-xl font-semibold text-purple-900 dark:text-purple-100">
                                  {(() => {
                                    const avg = customDeltas.reduce((sum, delta) => sum + Math.abs(delta.delta), 0) / customDeltas.length;
                                    return formatDelta(avg);
                                  })()}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Detailed Gates List */}
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
                Gate Details
              </h3>
              {gateOrder.map((macaddr, orderIndex) => {
                const gate = processedGates.find(g => g.macaddr === macaddr);
                if (!gate) return null;

                const color = getActivityColor(gate.timeSinceLastTrigger);

                return (
                  <div key={gate.macaddr} className="relative mb-4">
                    {/* Timeline connector */}
                    {orderIndex < gateOrder.length - 1 && (
                      <div className="absolute left-8 top-16 w-0.5 h-8 bg-gradient-to-b from-slate-300 to-transparent dark:from-slate-600" />
                    )}

                    <Card className={`
                      bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-0 shadow-lg 
                      transition-all duration-300 hover:shadow-xl hover:scale-[1.01]
                      ${selectedGates.includes(gate.macaddr) ? 'ring-2 ring-blue-500/30' : ''}
                      ${color === 'green' ? 'border-l-4 border-green-500' : 
                        color === 'yellow' ? 'border-l-4 border-yellow-500' :
                        color === 'orange' ? 'border-l-4 border-orange-500' : 'border-l-4 border-red-500'}
                    `}>
                      <CardContent className="p-6">
                        <div className="flex items-center space-x-4">
                          {/* Gate number indicator */}
                          <div className={`
                            w-12 h-12 rounded-full flex items-center justify-center font-semibold text-white
                            ${color === 'green' ? 'bg-green-500' : 
                              color === 'yellow' ? 'bg-yellow-500' :
                              color === 'orange' ? 'bg-orange-500' : 'bg-red-500'}
                            ${color === 'green' ? 'animate-pulse' : ''}
                          `}>
                            {orderIndex + 1}
                          </div>

                          {/* Gate information */}
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">MAC Address</p>
                              <p className="font-mono text-sm text-slate-900 dark:text-slate-100">
                                {gate.macaddr.toUpperCase()}
                              </p>
                            </div>

                            <div>
                              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                                Delta
                              </p>
                              <span className={`font-mono text-sm px-2 py-1 rounded`}>
                                {formatDelta(gate.timeSinceLastTrigger)}
                              </span>
                            </div>

                            <div>
                              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                                Position in Sequence
                              </p>
                              <span className="text-sm text-slate-700 dark:text-slate-300">
                                Gate #{orderIndex + 1} of {gateOrder.length}
                              </span>
                            </div>
                          </div>

                          {/* Selection indicator */}
                          <div className="flex flex-col items-center">
                            <input
                              type="checkbox"
                              checked={selectedGates.includes(gate.macaddr)}
                              onChange={() => toggleGateSelection(gate.macaddr)}
                              className="w-5 h-5"
                            />
                            <span className="text-xs text-slate-600 dark:text-slate-400 mt-1">Select</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
