'use client';

import React, { useState } from 'react';
import { ShardStats } from '@/lib/cache-engine';
import { PhysicalNodeConfig } from '@/lib/consistent-hash';
import {
  BarChart2,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Gauge,
  Activity,
  Layers,
} from 'lucide-react';

interface PartitionBalanceProps {
  nodes: PhysicalNodeConfig[];
  shards: ShardStats[];
  totalKeys: number;
  chiSquared: number;
  isUniform: boolean;
  onSimulateIngestion: (
    count: number,
    pattern: 'uniform' | 'zipfian' | 'sequential',
    ttlMs?: number
  ) => Promise<any>;
  onClearCluster: () => Promise<void>;
}

export function PartitionBalance({
  nodes,
  shards,
  totalKeys,
  chiSquared,
  isUniform,
  onSimulateIngestion,
  onClearCluster,
}: PartitionBalanceProps) {
  const [ingestCount, setIngestCount] = useState<number>(1000);
  const [ingestPattern, setIngestPattern] = useState<'uniform' | 'zipfian' | 'sequential'>('uniform');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<any | null>(null);

  // Compute key distribution across shards
  const shardMap = new Map<string, ShardStats>();
  for (const s of shards) {
    shardMap.set(s.shardId, s);
  }

  const expectedKeysPerNode = nodes.length > 0 ? totalKeys / nodes.length : 0;

  const handleSimulate = async (count: number) => {
    setIsSimulating(true);
    try {
      const res = await onSimulateIngestion(count, ingestPattern, 300000);
      setSimResult(res);
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-6 border border-slate-800 shadow-2xl flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <BarChart2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Partition Balance & Statistical Dispersion
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-mono border ${
                  isUniform
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800/60'
                    : 'bg-amber-950 text-amber-300 border-amber-800/60'
                }`}
              >
                {isUniform ? 'Uniform Hashing (Optimal)' : 'Clustering Skew'}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Chi-Squared (χ²) goodness-of-fit test validating virtual node anti-clustering
            </p>
          </div>
        </div>

        {/* Statistical Score Card */}
        <div className="flex items-center gap-3 bg-slate-900/90 px-3.5 py-1.5 rounded-xl border border-slate-800 font-mono text-xs">
          <div>
            <span className="text-[10px] text-slate-500 uppercase">χ² Variance: </span>
            <span className={`font-bold ${chiSquared <= (nodes.length - 1) * 2.5 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {chiSquared.toFixed(2)}
            </span>
          </div>
          <div className="h-4 w-px bg-slate-800" />
          <div>
            <span className="text-[10px] text-slate-500 uppercase">Mean / Shard: </span>
            <span className="text-slate-200 font-bold">{expectedKeysPerNode.toFixed(0)}</span>
          </div>
        </div>
      </div>

      {/* Bulk Key Ingestion Simulator Bar */}
      <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-slate-200">Key Generator:</span>
          </div>

          {/* Quick count buttons */}
          <div className="flex items-center gap-1.5">
            {[100, 1000, 5000].map((cnt) => (
              <button
                key={cnt}
                disabled={isSimulating}
                onClick={() => handleSimulate(cnt)}
                className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-cyan-950 hover:bg-cyan-900/70 text-cyan-300 border border-cyan-800/50 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
              >
                +{cnt.toLocaleString()} Keys
              </button>
            ))}
          </div>

          {/* Pattern select */}
          <select
            value={ingestPattern}
            onChange={(e) => setIngestPattern(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
          >
            <option value="uniform">Uniform Random</option>
            <option value="zipfian">Zipfian Hotspots</option>
            <option value="sequential">Sequential IDs</option>
          </select>
        </div>

        {/* Flush button */}
        <button
          onClick={onClearCluster}
          title="Clear all keys across all shards"
          className="px-3 py-1.5 rounded-lg text-xs font-mono text-rose-400 bg-rose-950/30 hover:bg-rose-950/60 border border-rose-900/50 transition-colors flex items-center gap-1.5 justify-center"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Flush All Keys
        </button>
      </div>

      {/* Simulator Execution Result Toast */}
      {simResult && simResult.simulation && (
        <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-900/50 text-xs font-mono text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Ingested {simResult.simulation.inserted.toLocaleString()} keys in{' '}
              {simResult.simulation.durationMs}ms ({simResult.simulation.opsPerSec.toLocaleString()} ops/sec)
            </span>
          </div>
          <span className="text-[11px] text-emerald-400/80">
            StdDev: ±{simResult.simulation.distribution?.stdDev} keys
          </span>
        </div>
      )}

      {/* Live Distribution Histogram */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs font-mono text-slate-400">
          <span>Physical Shard Key Allocation</span>
          <span>Target Ideal: {nodes.length > 0 ? (100 / nodes.length).toFixed(1) : 0}% per node</span>
        </div>

        <div className="space-y-3">
          {nodes.map((node) => {
            const shard = shardMap.get(node.id);
            const count = shard ? shard.entryCount : 0;
            const percentage = totalKeys > 0 ? (count / totalKeys) * 100 : 0;
            const idealPct = nodes.length > 0 ? 100 / nodes.length : 0;
            const deviation = percentage - idealPct;

            return (
              <div key={node.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: node.color }}
                    />
                    <span className="font-semibold text-slate-200">{node.name}</span>
                    <span className="text-[10px] text-slate-500">
                      ({node.vnodeCount} vnodes)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-100 font-bold">
                      {count.toLocaleString()} keys
                    </span>
                    <span className="text-slate-400 text-[11px] w-14 text-right">
                      {percentage.toFixed(1)}%
                    </span>
                    <span
                      className={`text-[10px] px-1 rounded ${
                        Math.abs(deviation) <= 3
                          ? 'text-emerald-400 bg-emerald-950/50'
                          : 'text-amber-400 bg-amber-950/50'
                      }`}
                    >
                      {deviation > 0 ? `+${deviation.toFixed(1)}%` : `${deviation.toFixed(1)}%`}
                    </span>
                  </div>
                </div>

                {/* Progress bar with ideal target marker */}
                <div className="relative w-full h-3 rounded-full bg-slate-900 border border-slate-800/80 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(1, percentage))}%`,
                      backgroundColor: node.color,
                    }}
                  />
                  {/* Ideal distribution marker line */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white/40 z-10"
                    style={{ left: `${idealPct}%` }}
                    title={`Ideal Target: ${idealPct.toFixed(1)}%`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
