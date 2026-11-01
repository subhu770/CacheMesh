'use client';

import React from 'react';
import { ClusterMetrics } from '@/lib/mesh-cluster';
import {
  Activity,
  Layers,
  Database,
  Gauge,
  Cpu,
  HardDrive,
  CheckCircle,
  TrendingUp,
} from 'lucide-react';

interface MetricsOverviewProps {
  metrics: ClusterMetrics | null;
}

export function MetricsOverview({ metrics }: MetricsOverviewProps) {
  if (!metrics) return null;

  const usedMB = Number((metrics.totalUsedMemoryBytes / (1024 * 1024)).toFixed(2));
  const maxMB = Number((metrics.totalMaxMemoryBytes / (1024 * 1024)).toFixed(0));
  const memoryPct = maxMB > 0 ? Number(((usedMB / maxMB) * 100).toFixed(1)) : 0;
  const avgVnodes =
    metrics.totalNodes > 0
      ? Math.round(metrics.totalVnodes / metrics.totalNodes)
      : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">
      {/* 1. Hit Ratio Card */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">Cache Hit Ratio</span>
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Gauge className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black text-emerald-400 font-mono">
            {metrics.overallHitRatio}%
          </span>
          <span className="text-xs text-slate-500 font-mono">
            ({metrics.totalHits.toLocaleString()} H / {metrics.totalMisses.toLocaleString()} M)
          </span>
        </div>
        <div className="mt-2.5 w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(2, metrics.overallHitRatio))}%` }}
          />
        </div>
      </div>

      {/* 2. Total Keys & Memory */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">Active Keys</span>
          <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Database className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black text-cyan-400 font-mono">
            {metrics.totalKeys.toLocaleString()}
          </span>
          <span className="text-xs text-slate-500 font-mono">
            {usedMB} MB / {maxMB} MB
          </span>
        </div>
        <div className="mt-2.5 w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-cyan-400 transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(2, memoryPct))}%` }}
          />
        </div>
      </div>

      {/* 3. Ring Virtual Nodes */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">VNodes Density</span>
          <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
            <Layers className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black text-violet-400 font-mono">
            {metrics.totalVnodes}
          </span>
          <span className="text-xs text-slate-500 font-mono">
            ~{avgVnodes} / server node
          </span>
        </div>
        <div className="mt-2.5 text-[11px] text-slate-400 font-mono flex items-center justify-between">
          <span>{metrics.totalNodes} Physical Shards</span>
          <span className="text-emerald-400">Anti-Hotspot ✓</span>
        </div>
      </div>

      {/* 4. Evictions & Saturation */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">Evictions Reclaimed</span>
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Activity className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black text-amber-400 font-mono">
            {metrics.totalEvictions}
          </span>
          <span className="text-xs text-slate-500 font-mono">
            Bounded LRU/LFU
          </span>
        </div>
        <div className="mt-2.5 text-[11px] text-slate-400 font-mono flex items-center justify-between">
          <span>χ² Variance: {metrics.chiSquaredVariance.toFixed(2)}</span>
          <span className="text-cyan-400">O(1) Purges</span>
        </div>
      </div>
    </div>
  );
}
