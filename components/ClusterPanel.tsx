'use client';

import React, { useState } from 'react';
import { PhysicalNodeConfig, MigrationPlan } from '@/lib/consistent-hash';
import { ShardStats } from '@/lib/cache-engine';
import {
  Server,
  Plus,
  Trash2,
  Cpu,
  Database,
  ArrowRightLeft,
  CheckCircle2,
  Sliders,
  HardDrive,
  Activity,
  Layers,
} from 'lucide-react';

interface ClusterPanelProps {
  nodes: PhysicalNodeConfig[];
  shards: ShardStats[];
  lastMigration: MigrationPlan | null;
  onAddNode: (node: Partial<PhysicalNodeConfig>) => Promise<void>;
  onDrainNode: (nodeId: string) => Promise<void>;
  onUpdateNode: (nodeId: string, updates: Partial<PhysicalNodeConfig>) => Promise<void>;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
}

export function ClusterPanel({
  nodes,
  shards,
  lastMigration,
  onAddNode,
  onDrainNode,
  onUpdateNode,
  selectedNodeId,
  onSelectNode,
}: ClusterPanelProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeColor, setNewNodeColor] = useState('#ec4899');
  const [newNodeVnodes, setNewNodeVnodes] = useState(100);
  const [newNodePolicy, setNewNodePolicy] = useState<'LRU' | 'LFU'>('LRU');
  const [newNodeMaxMemory, setNewNodeMaxMemory] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Color options for nodes
  const colorPalette = [
    { name: 'Emerald', hex: '#10b981' },
    { name: 'Cyan', hex: '#06b6d4' },
    { name: 'Violet', hex: '#8b5cf6' },
    { name: 'Amber', hex: '#f59e0b' },
    { name: 'Rose', hex: '#ec4899' },
    { name: 'Blue', hex: '#3b82f6' },
    { name: 'Teal', hex: '#14b8a6' },
    { name: 'Indigo', hex: '#6366f1' },
  ];

  const handleCreateNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNodeName.trim()) return;

    setIsSubmitting(true);
    try {
      const id = 'node-' + newNodeName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      await onAddNode({
        id,
        name: newNodeName.trim(),
        host: `10.0.${nodes.length + 1}.10`,
        port: 6379,
        color: newNodeColor,
        vnodeCount: newNodeVnodes,
        policy: newNodePolicy,
        maxMemoryMB: newNodeMaxMemory,
        maxEntries: 2000,
        status: 'ACTIVE',
      });
      setShowAddModal(false);
      setNewNodeName('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-5">
      {/* Migration Calculus Notification Card */}
      {lastMigration && (
        <div className="glass-panel p-4 rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/40 via-slate-900/60 to-indigo-950/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <ArrowRightLeft className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 font-mono">
                  Consistent Rebalance Calculus
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 font-mono border border-cyan-500/30">
                  {lastMigration.action === 'ADD_NODE' ? 'Node Joined' : 'Node Drained'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Target: <span className="text-slate-100 font-semibold">{lastMigration.affectedNodeId}</span> • 
                Migrated <span className="text-cyan-300 font-bold font-mono">{lastMigration.migratedKeysCount}</span> of {lastMigration.totalKeys} keys ({Number((lastMigration.migrationRatio * 100).toFixed(1))}%)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono bg-slate-950/60 px-3.5 py-2 rounded-lg border border-slate-800">
            <div>
              <div className="text-[10px] text-slate-400">Actual K/N</div>
              <div className="text-cyan-300 font-bold">
                {(lastMigration.migrationRatio * 100).toFixed(1)}%
              </div>
            </div>
            <div className="h-6 w-px bg-slate-800" />
            <div>
              <div className="text-[10px] text-slate-400">Theoretical K/N</div>
              <div className="text-emerald-400 font-bold">
                {(lastMigration.theoreticalRatio * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cluster Header & Add Node Action */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <Server className="w-5 h-5 text-cyan-400" />
          <h3 className="text-base font-bold text-slate-100">Physical Cache Shards</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
            {nodes.length} Active Nodes
          </span>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          Join Physical Node
        </button>
      </div>

      {/* Physical Node Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {nodes.map((node) => {
          const shard = shards.find((s) => s.shardId === node.id);
          const isSelected = selectedNodeId === node.id;
          const memoryUsedMB = shard
            ? Number((shard.usedMemoryBytes / (1024 * 1024)).toFixed(2))
            : 0;
          const memoryMaxMB = shard
            ? Number((shard.maxMemoryBytes / (1024 * 1024)).toFixed(0))
            : node.maxMemoryMB || 10;
          const memoryPercent = shard ? shard.memorySaturationPct : 0;

          return (
            <div
              key={node.id}
              onClick={() => onSelectNode && onSelectNode(isSelected ? null : node.id)}
              className={`glass-panel rounded-xl p-4 border transition-all cursor-pointer relative overflow-hidden ${
                isSelected
                  ? 'border-cyan-500/80 shadow-lg shadow-cyan-500/10 bg-slate-900/80'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-900/40'
              }`}
            >
              {/* Top Accent Color Bar */}
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ backgroundColor: node.color }}
              />

              {/* Node Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-3.5 h-3.5 rounded-full ring-2 ring-slate-800 shrink-0"
                    style={{ backgroundColor: node.color }}
                  />
                  <div>
                    <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      {node.name}
                      <span className="text-[10px] font-normal text-slate-400 font-mono">
                        {node.host}:{node.port}
                      </span>
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 font-mono text-slate-300">
                        {node.vnodeCount} vnodes
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextPolicy = node.policy === 'LRU' ? 'LFU' : 'LRU';
                          onUpdateNode(node.id, { policy: nextPolicy });
                        }}
                        title="Click to toggle LRU/LFU policy"
                        className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold transition-all hover:scale-105 bg-indigo-950/80 text-indigo-300 border border-indigo-800/60"
                      >
                        Policy: {node.policy || 'LRU'} ⇄
                      </button>
                    </div>
                  </div>
                </div>

                {/* Drain / Remove Node button */}
                <button
                  disabled={nodes.length <= 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Drain and remove physical shard "${node.name}"? Keys will be rebalanced clockwise to remaining nodes.`)) {
                      onDrainNode(node.id);
                    }
                  }}
                  title={nodes.length <= 1 ? "Cannot drain last remaining node" : "Drain & decommission node"}
                  className={`p-1.5 rounded-lg border text-xs transition-all ${
                    nodes.length <= 1
                      ? 'border-slate-800 text-slate-600 cursor-not-allowed'
                      : 'border-rose-900/60 text-rose-400 bg-rose-950/30 hover:bg-rose-900/50'
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Memory Saturation Bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-[11px] mb-1 font-mono">
                  <span className="text-slate-400 flex items-center gap-1">
                    <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                    Memory Ceiling
                  </span>
                  <span className="text-slate-200">
                    {memoryUsedMB} MB / {memoryMaxMB} MB ({memoryPercent}%)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, Math.max(2, memoryPercent))}%`,
                      backgroundColor:
                        memoryPercent > 85 ? '#f43f5e' : node.color,
                    }}
                  />
                </div>
              </div>

              {/* Shard Telemetry Grid */}
              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-center font-mono">
                <div className="p-1.5 rounded bg-slate-950/50">
                  <div className="text-[10px] text-slate-400">Entries</div>
                  <div className="text-xs font-bold text-slate-100">
                    {shard ? shard.entryCount.toLocaleString() : 0}
                  </div>
                </div>
                <div className="p-1.5 rounded bg-slate-950/50">
                  <div className="text-[10px] text-slate-400">Hit Rate</div>
                  <div className="text-xs font-bold text-emerald-400">
                    {shard ? `${shard.hitRatio}%` : '0%'}
                  </div>
                </div>
                <div className="p-1.5 rounded bg-slate-950/50">
                  <div className="text-[10px] text-slate-400">Evictions</div>
                  <div className="text-xs font-bold text-amber-400">
                    {shard ? shard.evictionCount : 0}
                  </div>
                </div>
                <div className="p-1.5 rounded bg-slate-950/50">
                  <div className="text-[10px] text-slate-400">Latency</div>
                  <div className="text-xs font-bold text-cyan-400">
                    {shard ? `${shard.avgReadLatencyUs}µs` : '0µs'}
                  </div>
                </div>
              </div>

              {/* VNode Slider control */}
              <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between gap-3 text-[11px] font-mono">
                <span className="text-slate-400 flex items-center gap-1">
                  <Sliders className="w-3 h-3" />
                  VNodes:
                </span>
                <input
                  type="range"
                  min="20"
                  max="200"
                  step="10"
                  value={node.vnodeCount}
                  onChange={(e) => {
                    const count = Number(e.target.value);
                    onUpdateNode(node.id, { vnodeCount: count });
                  }}
                  className="w-28 accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
                <span className="text-slate-200 font-bold w-8 text-right">
                  {node.vnodeCount}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Node Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="glass-panel w-full max-w-md rounded-2xl p-6 border border-slate-700 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2.5">
                <Server className="w-5 h-5 text-cyan-400" />
                <h4 className="text-base font-bold text-slate-100">Join New Physical Shard</h4>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNode} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Node Identifier / Region Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Node-Epsilon (ap-northeast)"
                  value={newNodeName}
                  onChange={(e) => setNewNodeName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Color Presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Topology Ring Color
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {colorPalette.map((col) => (
                    <button
                      key={col.hex}
                      type="button"
                      onClick={() => setNewNodeColor(col.hex)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${
                        newNodeColor === col.hex
                          ? 'border-white scale-110 shadow-md'
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: col.hex }}
                    />
                  ))}
                </div>
              </div>

              {/* VNode Count Slider */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-1.5">
                  <span>Virtual Nodes (VNodes)</span>
                  <span className="font-mono text-cyan-300">{newNodeVnodes} vnodes</span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="200"
                  step="10"
                  value={newNodeVnodes}
                  onChange={(e) => setNewNodeVnodes(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Higher vnodes eliminate hotspot clustering & guarantee uniform key dispersion.
                </p>
              </div>

              {/* Eviction Policy */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Eviction Engine
                  </label>
                  <select
                    value={newNodePolicy}
                    onChange={(e) => setNewNodePolicy(e.target.value as 'LRU' | 'LFU')}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                  >
                    <option value="LRU">LRU (Least Recently Used)</option>
                    <option value="LFU">LFU (Least Frequently Used)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Memory Ceiling
                  </label>
                  <select
                    value={newNodeMaxMemory}
                    onChange={(e) => setNewNodeMaxMemory(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                  >
                    <option value={5}>5 MB (Edge Shard)</option>
                    <option value={10}>10 MB (Standard)</option>
                    <option value={25}>25 MB (High Capacity)</option>
                    <option value={50}>50 MB (Core Shard)</option>
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newNodeName.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50"
                >
                  {isSubmitting ? 'Joining Ring...' : 'Bootstrap & Rebalance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
