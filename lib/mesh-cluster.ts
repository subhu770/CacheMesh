/**
 * CacheMesh Distributed Cluster Manager
 * 
 * Bridges the ConsistentHashRing with individual CacheShards.
 * Provides cluster-wide routing, dynamic rebalancing, migration calculus,
 * simulation, and global singleton state preservation for Next.js API routes.
 */

import {
  ConsistentHashRing,
  PhysicalNodeConfig,
  KeyRouteResult,
  MigrationPlan,
  VirtualNode,
} from './consistent-hash';
import { CacheShard, EvictionEvent, ShardStats } from './cache-engine';

export interface ClusterMetrics {
  totalNodes: number;
  totalVnodes: number;
  totalKeys: number;
  totalUsedMemoryBytes: number;
  totalMaxMemoryBytes: number;
  overallHitRatio: number;
  totalHits: number;
  totalMisses: number;
  totalEvictions: number;
  chiSquaredVariance: number;
  isUniformDistribution: boolean;
  shards: ShardStats[];
}

export class MeshCluster {
  private ring: ConsistentHashRing;
  private shards: Map<string, CacheShard> = new Map();
  private globalEvictionHistory: EvictionEvent[] = [];
  private lastMigrationPlan: MigrationPlan | null = null;

  constructor() {
    this.ring = new ConsistentHashRing({ defaultVnodeCount: 100 });
    this.bootstrapDefaultNodes();
  }

  private bootstrapDefaultNodes(): void {
    const defaultNodes: PhysicalNodeConfig[] = [
      {
        id: 'node-alpha',
        name: 'Node-Alpha',
        host: '10.0.1.10',
        port: 6379,
        color: '#10b981', // Emerald
        vnodeCount: 100,
        status: 'ACTIVE',
        policy: 'LRU',
        maxEntries: 2000,
        maxMemoryMB: 10,
      },
      {
        id: 'node-beta',
        name: 'Node-Beta',
        host: '10.0.2.20',
        port: 6379,
        color: '#06b6d4', // Cyan
        vnodeCount: 100,
        status: 'ACTIVE',
        policy: 'LRU',
        maxEntries: 2000,
        maxMemoryMB: 10,
      },
      {
        id: 'node-gamma',
        name: 'Node-Gamma',
        host: '10.0.3.30',
        port: 6379,
        color: '#8b5cf6', // Violet
        vnodeCount: 100,
        status: 'ACTIVE',
        policy: 'LFU',
        maxEntries: 2000,
        maxMemoryMB: 10,
      },
      {
        id: 'node-delta',
        name: 'Node-Delta',
        host: '10.0.4.40',
        port: 6379,
        color: '#f59e0b', // Amber
        vnodeCount: 100,
        status: 'ACTIVE',
        policy: 'LRU',
        maxEntries: 2000,
        maxMemoryMB: 10,
      },
    ];

    for (const node of defaultNodes) {
      this.addPhysicalNode(node, false);
    }

    // Seed with a few demo keys for immediate visualizer richness
    const demoItems = [
      { key: 'user:1001', val: { name: 'Alice Cooper', role: 'admin' }, ttl: 300000 },
      { key: 'user:1002', val: { name: 'Bob Dylan', role: 'editor' }, ttl: 300000 },
      { key: 'session:tok_991a', val: { userId: '1001', ip: '192.168.1.5' }, ttl: 120000 },
      { key: 'session:tok_882b', val: { userId: '1002', ip: '10.0.0.42' }, ttl: 120000 },
      { key: 'product:sku_410', val: { title: 'NVMe Gen5 2TB SSD', price: 199.99 }, ttl: 600000 },
      { key: 'product:sku_520', val: { title: 'DDR5 64GB 6000MHz', price: 219.0 }, ttl: 600000 },
      { key: 'cache:geo:us_east', val: { lat: 39.0438, lng: -77.4874 }, ttl: 900000 },
      { key: 'config:rate_limit:burst', val: { max: 1000, windowMs: 1000 }, ttl: null },
      { key: 'auth:jwt:pubkey_rsa', val: { kid: 'mesh-prod-1', alg: 'RS256' }, ttl: null },
      { key: 'stats:mesh:p99_latency', val: { valUs: 142.5 }, ttl: 60000 },
    ];

    for (const item of demoItems) {
      this.set(item.key, item.val, item.ttl ?? undefined);
    }
  }

  /**
   * Adds a physical server node with migration tracking
   */
  public addPhysicalNode(node: PhysicalNodeConfig, trackMigration = true): MigrationPlan | null {
    let plan: MigrationPlan | null = null;
    const allKeys = this.getAllKeys();

    if (trackMigration && allKeys.length > 0) {
      plan = this.ring.calculateMigration(allKeys, 'ADD_NODE', node);
      this.lastMigrationPlan = plan;
    }

    // Initialize shard if not exists
    if (!this.shards.has(node.id)) {
      this.shards.set(
        node.id,
        new CacheShard({
          shardId: node.id,
          policy: node.policy ?? 'LRU',
          maxEntries: node.maxEntries ?? 2000,
          maxMemoryMB: node.maxMemoryMB ?? 10,
        })
      );
    }

    // Add to consistent ring
    this.ring.addNode(node);

    // Physically migrate keys if planned
    if (plan && plan.details.length > 0) {
      for (const item of plan.details) {
        const fromShard = this.shards.get(item.fromNode);
        const toShard = this.shards.get(item.toNode);
        if (fromShard && toShard) {
          const fetched = fromShard.get(item.key);
          if (fetched.hit && fetched.entry) {
            toShard.set(
              item.key,
              fetched.entry.value,
              fetched.entry.expiresAt ? Math.max(1000, fetched.entry.expiresAt - Date.now()) : undefined
            );
            fromShard.delete(item.key, 'MANUAL');
          }
        }
      }
    }

    return plan;
  }

  /**
   * Drains or removes a physical node with migration tracking
   */
  public removePhysicalNode(nodeId: string): MigrationPlan | null {
    const node = this.ring.getTopology().nodes.find((n) => n.id === nodeId);
    if (!node) return null;

    const allKeys = this.getAllKeys();
    const plan = this.ring.calculateMigration(allKeys, 'REMOVE_NODE', node);
    this.lastMigrationPlan = plan;

    // Migrate keys out of drained shard
    if (plan.details.length > 0) {
      const fromShard = this.shards.get(nodeId);
      if (fromShard) {
        for (const item of plan.details) {
          const toShard = this.shards.get(item.toNode);
          if (toShard) {
            const fetched = fromShard.get(item.key);
            if (fetched.hit && fetched.entry) {
              toShard.set(
                item.key,
                fetched.entry.value,
                fetched.entry.expiresAt ? Math.max(1000, fetched.entry.expiresAt - Date.now()) : undefined
              );
            }
          }
        }
      }
    }

    // Remove from ring and shards
    this.ring.removeNode(nodeId);
    this.shards.delete(nodeId);

    return plan;
  }

  /**
   * Route and write a key/value pair
   */
  public set(
    key: string,
    value: unknown,
    ttlMs?: number
  ): {
    route: KeyRouteResult;
    evicted: EvictionEvent | null;
    sizeBytes: number;
    latencyUs: number;
  } {
    const route = this.ring.getNode(key);
    if (!route) {
      throw new Error('Consistent hash ring has no active nodes!');
    }

    let shard = this.shards.get(route.targetNode.id);
    if (!shard) {
      shard = new CacheShard({
        shardId: route.targetNode.id,
        policy: route.targetNode.policy ?? 'LRU',
        maxEntries: route.targetNode.maxEntries ?? 2000,
        maxMemoryMB: route.targetNode.maxMemoryMB ?? 10,
      });
      this.shards.set(route.targetNode.id, shard);
    }

    const { evicted, latencyUs, sizeBytes } = shard.set(key, value, ttlMs);

    if (evicted) {
      this.globalEvictionHistory.unshift(evicted);
      if (this.globalEvictionHistory.length > 100) {
        this.globalEvictionHistory.pop();
      }
    }

    return { route, evicted, sizeBytes, latencyUs };
  }

  /**
   * Route and retrieve a key
   */
  public get(key: string): {
    route: KeyRouteResult;
    hit: boolean;
    value: unknown;
    expiresAt: number | null;
    accessCount: number;
    latencyUs: number;
  } {
    const route = this.ring.getNode(key);
    if (!route) {
      throw new Error('Consistent hash ring has no active nodes!');
    }

    const shard = this.shards.get(route.targetNode.id);
    if (!shard) {
      return {
        route,
        hit: false,
        value: null,
        expiresAt: null,
        accessCount: 0,
        latencyUs: 0,
      };
    }

    const { entry, hit, latencyUs } = shard.get(key);

    return {
      route,
      hit,
      value: entry ? entry.value : null,
      expiresAt: entry ? entry.expiresAt : null,
      accessCount: entry ? entry.accessCount : 0,
      latencyUs,
    };
  }

  /**
   * Invalidate a key
   */
  public delete(key: string): { route: KeyRouteResult | null; deleted: boolean } {
    const route = this.ring.getNode(key);
    if (!route) return { route: null, deleted: false };

    const shard = this.shards.get(route.targetNode.id);
    if (!shard) return { route, deleted: false };

    const ev = shard.delete(key, 'MANUAL');
    return { route, deleted: !!ev };
  }

  /**
   * Get all active keys across all shards
   */
  public getAllKeys(): string[] {
    const keys: string[] = [];
    for (const shard of this.shards.values()) {
      keys.push(...shard.getAllKeys());
    }
    return keys;
  }

  /**
   * Bulk ingestion simulator for testing partition balance & stress testing
   */
  public simulateIngestion(
    count: number,
    pattern: 'uniform' | 'zipfian' | 'sequential' = 'uniform',
    ttlMs?: number
  ): {
    inserted: number;
    durationMs: number;
    opsPerSec: number;
    distribution: ReturnType<ConsistentHashRing['evaluateDistribution']>;
  } {
    const startTime = performance.now();
    const keys: string[] = [];

    for (let i = 0; i < count; i++) {
      let key = '';
      if (pattern === 'sequential') {
        key = `key:${String(i).padStart(6, '0')}`;
      } else if (pattern === 'zipfian') {
        // Skewed Zipf-like distribution
        const rank = Math.floor(Math.pow(Math.random(), 2.2) * 200) + 1;
        key = `hotspot:${rank}`;
      } else {
        // Uniform random
        const randStr = Math.random().toString(36).slice(2, 8);
        key = `obj:${randStr}:${i}`;
      }

      const val = {
        id: i,
        payload: `payload_data_${i}`,
        created: Date.now(),
      };

      this.set(key, val, ttlMs);
      keys.push(key);
    }

    const durationMs = performance.now() - startTime;
    const opsPerSec = Math.round((count / (durationMs / 1000)) || 0);

    const allClusterKeys = this.getAllKeys();
    const distribution = this.ring.evaluateDistribution(allClusterKeys);

    return {
      inserted: count,
      durationMs: Number(durationMs.toFixed(2)),
      opsPerSec,
      distribution,
    };
  }

  /**
   * Updates shard configuration
   */
  public updateShardConfig(
    shardId: string,
    config: { policy?: 'LRU' | 'LFU'; vnodeCount?: number; maxEntries?: number; maxMemoryMB?: number; color?: string }
  ): void {
    const shard = this.shards.get(shardId);
    if (shard) {
      if (config.policy) shard.setPolicy(config.policy);
      if (config.maxEntries) shard.setMaxEntries(config.maxEntries);
      if (config.maxMemoryMB) shard.setMaxMemoryMB(config.maxMemoryMB);
    }

    this.ring.updateNode(shardId, {
      ...(config.vnodeCount ? { vnodeCount: config.vnodeCount } : {}),
      ...(config.color ? { color: config.color } : {}),
      ...(config.policy ? { policy: config.policy } : {}),
    });
  }

  /**
   * Clear all keys across all shards
   */
  public clearAll(): void {
    for (const shard of this.shards.values()) {
      for (const k of shard.getAllKeys()) {
        shard.delete(k, 'MANUAL');
      }
    }
    this.globalEvictionHistory = [];
  }

  /**
   * Ring & cluster metrics snapshot
   */
  public getMetrics(): ClusterMetrics {
    const shardStatsList = Array.from(this.shards.values()).map((s) => s.getStats());
    const allKeys = this.getAllKeys();
    const distribution = this.ring.evaluateDistribution(allKeys);

    let totalUsedMemoryBytes = 0;
    let totalMaxMemoryBytes = 0;
    let totalHits = 0;
    let totalMisses = 0;
    let totalEvictions = 0;

    for (const s of shardStatsList) {
      totalUsedMemoryBytes += s.usedMemoryBytes;
      totalMaxMemoryBytes += s.maxMemoryBytes;
      totalHits += s.hits;
      totalMisses += s.misses;
      totalEvictions += s.evictionCount;
    }

    const totalRequests = totalHits + totalMisses;
    const overallHitRatio =
      totalRequests > 0 ? Number(((totalHits / totalRequests) * 100).toFixed(1)) : 0;

    const ringTopo = this.ring.getTopology();

    return {
      totalNodes: ringTopo.totalNodes,
      totalVnodes: ringTopo.totalVnodes,
      totalKeys: allKeys.length,
      totalUsedMemoryBytes,
      totalMaxMemoryBytes,
      overallHitRatio,
      totalHits,
      totalMisses,
      totalEvictions,
      chiSquaredVariance: distribution.chiSquared,
      isUniformDistribution: distribution.isUniform,
      shards: shardStatsList,
    };
  }

  /**
   * Returns visualizer-ready coordinates for ring and keys
   */
  public getVisualizerData(): {
    vnodes: VirtualNode[];
    nodes: PhysicalNodeConfig[];
    keys: Array<{
      key: string;
      hash: number;
      angleDeg: number;
      targetNodeId: string;
      color: string;
    }>;
    recentEvictions: EvictionEvent[];
    lastMigration: MigrationPlan | null;
    metrics: ClusterMetrics;
  } {
    const topo = this.ring.getTopology();
    const allKeys = this.getAllKeys();

    // Map up to 200 sample keys for the visualizer perimeter ring
    const sampleKeys = allKeys.slice(0, 150).map((k) => {
      const route = this.ring.getNode(k);
      return {
        key: k,
        hash: route ? route.hash : 0,
        angleDeg: route ? route.angleDeg : 0,
        targetNodeId: route ? route.targetNode.id : '',
        color: route ? route.targetNode.color : '#94a3b8',
      };
    });

    return {
      vnodes: topo.vnodes,
      nodes: topo.nodes,
      keys: sampleKeys,
      recentEvictions: this.globalEvictionHistory.slice(0, 30),
      lastMigration: this.lastMigrationPlan,
      metrics: this.getMetrics(),
    };
  }
}

// Global Singleton for Next.js Fast Refresh & API route state persistence
declare global {
  var __cacheMeshCluster: MeshCluster | undefined;
}

export function getMeshCluster(): MeshCluster {
  if (!globalThis.__cacheMeshCluster) {
    globalThis.__cacheMeshCluster = new MeshCluster();
  }
  return globalThis.__cacheMeshCluster;
}
