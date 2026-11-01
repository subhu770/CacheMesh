'use client';

import React from 'react';
import { EvictionEvent } from '@/lib/cache-engine';
import { Flame, Clock, HardDrive, RefreshCw, AlertOctagon } from 'lucide-react';

interface EvictionFeedProps {
  evictions: EvictionEvent[];
}

export function EvictionFeed({ evictions }: EvictionFeedProps) {
  return (
    <div className="glass-panel rounded-2xl p-6 border border-slate-800 shadow-2xl flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Live Eviction Event Stream
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {evictions.length} Recent Drops
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              O(1) DLL tail purges and LFU frequency bucket drops upon bounded memory ceiling saturation
            </p>
          </div>
        </div>
      </div>

      {/* Events List */}
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {evictions.length === 0 ? (
          <div className="py-8 text-center text-xs font-mono text-slate-500 flex flex-col items-center gap-2">
            <RefreshCw className="w-5 h-5 text-slate-600 animate-spin-slow" />
            No evictions yet. Cluster memory headroom is operating within configured thresholds.
          </div>
        ) : (
          evictions.map((ev) => (
            <div
              key={ev.id}
              className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3 text-xs font-mono animate-in slide-in-from-right-2"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`p-1.5 rounded-lg ${
                    ev.reason === 'TTL_EXPIRED'
                      ? 'bg-amber-950 text-amber-400 border border-amber-800/50'
                      : ev.reason === 'MEMORY_SATURATION'
                      ? 'bg-rose-950 text-rose-400 border border-rose-800/50'
                      : 'bg-indigo-950 text-indigo-400 border border-indigo-800/50'
                  }`}
                >
                  {ev.reason === 'TTL_EXPIRED' ? (
                    <Clock className="w-3.5 h-3.5" />
                  ) : (
                    <AlertOctagon className="w-3.5 h-3.5" />
                  )}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-200">{ev.key}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {ev.shardId}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Policy: <span className="text-cyan-300">{ev.policy}</span> • Reason:{' '}
                    <span className="text-slate-400">{ev.reason}</span> • Access Count:{' '}
                    <span className="text-slate-300">{ev.accessCount}</span>
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-emerald-400 font-bold">
                  +{ev.bytesReclaimed} B
                </div>
                <div className="text-[10px] text-slate-500">
                  {new Date(ev.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
