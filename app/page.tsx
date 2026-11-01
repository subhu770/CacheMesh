'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RingCanvas } from '@/components/RingCanvas';
import { ClusterPanel } from '@/components/ClusterPanel';
import { KeySimulator } from '@/components/KeySimulator';
import { PartitionBalance } from '@/components/PartitionBalance';
import { EvictionFeed } from '@/components/EvictionFeed';
import { MetricsOverview } from '@/components/MetricsOverview';
import { PhysicalNodeConfig, VirtualNode, MigrationPlan } from '@/lib/consistent-hash';
import { ShardStats, EvictionEvent } from '@/lib/cache-engine';
import { ClusterMetrics } from '@/lib/mesh-cluster';
import {
  Compass,
  RefreshCw,
  Info,
  Server,
  Zap,
  Layers,
  Activity,
  Code2,
  CheckCircle2,
  Cpu,
} from 'lucide-react';

export default function CacheMeshDashboard() {
  const [nodes, setNodes] = useState<PhysicalNodeConfig[]>([]);
  const [vnodes, setVnodes] = useState<VirtualNode[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [shards, setShards] = useState<ShardStats[]>([]);
  const [metrics, setMetrics] = useState<ClusterMetrics | null>(null);
  const [evictions, setEvictions] = useState<EvictionEvent[]>([]);
  const [lastMigration, setLastMigration] = useState<MigrationPlan | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeRouteTrace, setActiveRouteTrace] = useState<any | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showArchModal, setShowArchModal] = useState(false);

  // Fetch full ring topology and cluster status
  const fetchRingData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch('/api/v1/ring');
      if (!res.ok) throw new Error('Failed to load ring status');
      const data = await res.json();

      if (data.success) {
        setNodes(data.nodes || []);
        setVnodes(data.vnodes || []);
        setKeys(data.keys || []);
        setMetrics(data.metrics || null);
        setShards(data.metrics?.shards || []);
        setEvictions(data.recentEvictions || []);
        if (data.lastMigration) {
          setLastMigration(data.lastMigration);
        }
      }
    } catch (err) {
      console.error('Error fetching ring data:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Initial load & recurring poll
  useEffect(() => {
    fetchRingData();
  }, [fetchRingData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchRingData();
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchRingData]);

  // Execute single key cache operation (GET, POST, DELETE)
  const handleKeyOperation = async (
    method: 'GET' | 'POST' | 'DELETE',
    key: string,
    value?: unknown,
    ttlMs?: number
  ) => {
    let endpoint = '/api/v1/cache';
    let options: RequestInit = { method };

    if (method === 'GET') {
      endpoint += `?key=${encodeURIComponent(key)}`;
    } else if (method === 'DELETE') {
      endpoint += `?key=${encodeURIComponent(key)}`;
    } else if (method === 'POST') {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify({ key, value, ttlMs });
    }

    const res = await fetch(endpoint, options);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to execute cache operation');
    }

    // Trigger visual routing trace animation on the canvas ring
    if (data.routing) {
      setActiveRouteTrace({
        key,
        hash: data.routing.hash,
        angleDeg: data.routing.angleDeg,
        targetNodeId: data.routing.targetNode?.id,
        vnodeId: data.routing.targetVNode?.vnodeId,
        searchSteps: data.routing.binarySearchSteps,
        timestamp: Date.now(),
      });
    }

    // Refresh cluster snapshot
    await fetchRingData();
    return data;
  };

  // Add physical node dynamically
  const handleAddNode = async (node: Partial<PhysicalNodeConfig>) => {
    const res = await fetch('/api/v1/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', node }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add node');

    if (data.migration) {
      setLastMigration(data.migration);
    }
    await fetchRingData();
  };

  // Drain / remove physical node dynamically
  const handleDrainNode = async (nodeId: string) => {
    const res = await fetch('/api/v1/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'drain', nodeId }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to drain node');

    if (data.migration) {
      setLastMigration(data.migration);
    }
    await fetchRingData();
  };

  // Update node configuration (vnodes, policy, color)
  const handleUpdateNode = async (
    nodeId: string,
    updates: Partial<PhysicalNodeConfig>
  ) => {
    const res = await fetch('/api/v1/nodes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, ...updates }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update node');

    await fetchRingData();
  };

  // Simulate bulk key ingestion
  const handleSimulateIngestion = async (
    count: number,
    pattern: 'uniform' | 'zipfian' | 'sequential',
    ttlMs?: number
  ) => {
    const res = await fetch('/api/v1/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count, pattern, ttlMs }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Simulation failed');

    await fetchRingData();
    return data;
  };

  // Clear all keys
  const handleClearCluster = async () => {
    if (!confirm('Flush all keys across all cache shards?')) return;
    const res = await fetch('/api/v1/clear', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to clear cluster');
    await fetchRingData();
  };

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex flex-col gap-6">
      {/* Top Navigation Bar */}
      <header className="glass-panel rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-2xl flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Logo */}
        <div className="flex items-center gap-3.5">
          <div className="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-500 to-violet-500 p-0.5 shadow-lg shadow-cyan-500/25">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <Compass className="w-6 h-6 text-cyan-400 animate-spin-slow" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-black text-slate-100 tracking-tight font-sans">
                CacheMesh
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-cyan-950 text-cyan-300 border border-cyan-800/80 font-bold tracking-wider">
                v1.0 DISTRIBUTED
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Consistent Hashing Ring & O(1) LRU/LFU Shard Partitioner
            </p>
          </div>
        </div>

        {/* Status Badges & Quick Actions */}
        <div className="flex items-center gap-3">
          {/* Cluster Status Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300">Ring Status:</span>
            <span className="text-emerald-400 font-bold">HEALTHY</span>
          </div>

          {/* Architecture Reference Modal Button */}
          <button
            onClick={() => setShowArchModal(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:text-cyan-300 transition-all flex items-center gap-1.5"
          >
            <Info className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Architecture</span>
          </button>

          {/* Refresh Control */}
          <button
            onClick={() => fetchRingData()}
            disabled={isRefreshing}
            title="Refresh ring status"
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </header>

      {/* Cluster Key Performance Indicators */}
      <MetricsOverview metrics={metrics} />

      {/* Main Grid: Visualizer & Router */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: 2D Consistent Hashing Ring Canvas (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <RingCanvas
            vnodes={vnodes}
            nodes={nodes}
            keys={keys}
            activeRouteTrace={activeRouteTrace}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />

          {/* Real-time Eviction Feed below canvas on left column */}
          <EvictionFeed evictions={evictions} />
        </div>

        {/* Right Column: Shards, Simulator & Balance (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Live Key Router / Simulator */}
          <KeySimulator onExecute={handleKeyOperation} />

          {/* Partition Balance & Statistical Dispersion */}
          <PartitionBalance
            nodes={nodes}
            shards={shards}
            totalKeys={metrics?.totalKeys || 0}
            chiSquared={metrics?.chiSquaredVariance || 0}
            isUniform={metrics?.isUniformDistribution ?? true}
            onSimulateIngestion={handleSimulateIngestion}
            onClearCluster={handleClearCluster}
          />

          {/* Physical Cluster Shard Management Panel */}
          <ClusterPanel
            nodes={nodes}
            shards={shards}
            lastMigration={lastMigration}
            onAddNode={handleAddNode}
            onDrainNode={handleDrainNode}
            onUpdateNode={handleUpdateNode}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        </div>
      </div>

      {/* Architecture Deep Dive Modal */}
      {showArchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="glass-panel w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-6 border border-slate-700 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Compass className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-slate-100 font-sans">
                  CacheMesh Architecture Specification
                </h3>
              </div>
              <button
                onClick={() => setShowArchModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-300 leading-relaxed font-mono">
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                <div className="text-cyan-400 font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  1. 32-bit Integer Ring & MurmurHash3
                </div>
                <p className="text-slate-400">
                  Ring maps the discrete range [0, 2³² - 1] (0 to 4,294,967,295). MurmurHash3 yields avalanche uniformity, avoiding hash collisions and hotspots.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                <div className="text-violet-400 font-bold flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  2. Virtual Nodes (VNodes) & Dispersion
                </div>
                <p className="text-slate-400">
                  Each physical node manages 50 to 150 virtual nodes along the ring perimeter. This breaks contiguous ranges into interleaved shards, reducing partition variance and achieving statistically validated Chi-Squared (χ²) uniform balance.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                <div className="text-emerald-400 font-bold flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  3. O(log N) Binary Search Bisect Routing
                </div>
                <p className="text-slate-400">
                  Key routing computes the key hash, then performs an upper-bound binary search over the sorted vnode array to pinpoint the clockwise target shard in log₂(N) steps (typically ≤ 8 iterations for 400 vnodes).
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                <div className="text-amber-400 font-bold flex items-center gap-2">
                  <Cpu className="w-4 h-4" />
                  4. Minimal K/N Key Migration Calculus
                </div>
                <p className="text-slate-400">
                  Unlike naive modulo hashing (hash % N) which invalidates ~100% of keys on topology changes, CacheMesh only migrates K / N keys (where K = total keys, N = node count) strictly between the new node and its clockwise neighbors.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                <div className="text-rose-400 font-bold flex items-center gap-2">
                  <Server className="w-4 h-4" />
                  5. In-Memory O(1) LRU & LFU Shard Engines
                </div>
                <p className="text-slate-400">
                  Backed by Doubly-Linked Lists with sentinel head/tail nodes. LRU relocates nodes to head on access and evicts from tail in O(1). LFU groups entries into frequency bucket DLLs with an active minFreq pointer, achieving true O(1) across get, set, and evict.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowArchModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all"
              >
                Close Reference
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
