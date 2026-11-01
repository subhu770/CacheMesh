/**
 * CacheMesh Consistent Hashing Ring
 * 
 * Implements a distributed consistent hashing ring mapping 32-bit integer space [0, 2^32 - 1].
 * Features:
 * - 32-bit MurmurHash3 & 32-bit FNV-1a hash functions
 * - Configurable Virtual Nodes (vnodes) (default 100, range 50 - 150+)
 * - O(log N) Binary Search (Bisect / Upper-bound) clockwise key routing
 * - Dynamic node membership lifecycle with minimal K/N key migration calculus
 */

export const RING_SIZE = 4294967296; // 2^32

/**
 * 32-bit MurmurHash3 implementation.
 * Produces a uniformly distributed 32-bit unsigned integer [0, 2^32 - 1].
 */
export function murmurHash3(key: string, seed: number = 0): number {
  let h1 = seed >>> 0;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  const len = key.length;
  let i = 0;

  while (i + 4 <= len) {
    let k1 =
      (key.charCodeAt(i) & 0xff) |
      ((key.charCodeAt(i + 1) & 0xff) << 8) |
      ((key.charCodeAt(i + 2) & 0xff) << 16) |
      ((key.charCodeAt(i + 3) & 0xff) << 24);

    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);

    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = Math.imul(h1, 5) + 0xe6546b64;
    i += 4;
  }

  let k1 = 0;
  const rem = len - i;
  if (rem === 3) k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;
  if (rem >= 2) k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;
  if (rem >= 1) {
    k1 ^= key.charCodeAt(i) & 0xff;
    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);
    h1 ^= k1;
  }

  h1 ^= len;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;

  return h1 >>> 0;
}

/**
 * 32-bit FNV-1a hash algorithm alternative
 */
export function fnv1a32(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export type HashAlgorithm = 'murmur3' | 'fnv1a';

export interface PhysicalNodeConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  weight?: number; // Relative weight multiplier
  color: string;
  vnodeCount: number; // Configurable: 50 to 150
  status: 'ACTIVE' | 'DRAINING' | 'INACTIVE';
  policy?: 'LRU' | 'LFU';
  maxEntries?: number;
  maxMemoryMB?: number;
}

export interface VirtualNode {
  hash: number;
  vnodeId: string;
  nodeId: string;
  color: string;
  angleDeg: number; // 0 to 360 degrees
  vnodeIndex: number;
}

export interface KeyRouteResult {
  key: string;
  hash: number;
  hashHex: string;
  angleDeg: number;
  targetNode: PhysicalNodeConfig;
  targetVNode: VirtualNode;
  clockwiseDistance: number;
  ringIndex: number;
  searchSteps: number;
  totalVnodes: number;
}

export interface MigrationPlan {
  action: 'ADD_NODE' | 'REMOVE_NODE';
  affectedNodeId: string;
  totalKeys: number;
  migratedKeysCount: number;
  migrationRatio: number;
  theoreticalRatio: number; // K / N
  details: Array<{
    key: string;
    fromNode: string;
    toNode: string;
  }>;
}

export class ConsistentHashRing {
  private hashAlgorithm: HashAlgorithm;
  private defaultVnodeCount: number;
  // Sorted list of virtual nodes by hash ascending
  private ring: VirtualNode[] = [];
  // Physical nodes map
  private physicalNodes: Map<string, PhysicalNodeConfig> = new Map();

  constructor(options?: { hashAlgorithm?: HashAlgorithm; defaultVnodeCount?: number }) {
    this.hashAlgorithm = options?.hashAlgorithm ?? 'murmur3';
    this.defaultVnodeCount = options?.defaultVnodeCount ?? 100;
  }

  public getHash(key: string): number {
    return this.hashAlgorithm === 'murmur3' ? murmurHash3(key) : fnv1a32(key);
  }

  public setHashAlgorithm(algo: HashAlgorithm): void {
    this.hashAlgorithm = algo;
    this.rebuildRing();
  }

  public getHashAlgorithm(): HashAlgorithm {
    return this.hashAlgorithm;
  }

  /**
   * Adds a physical node to the ring, generating its virtual nodes
   */
  public addNode(node: PhysicalNodeConfig): void {
    const vnodes = node.vnodeCount || this.defaultVnodeCount;
    const boundedVnodes = Math.max(10, Math.min(500, vnodes));

    const updatedNode: PhysicalNodeConfig = {
      ...node,
      vnodeCount: boundedVnodes,
      status: 'ACTIVE',
    };

    this.physicalNodes.set(node.id, updatedNode);

    // Generate virtual nodes
    for (let i = 0; i < boundedVnodes; i++) {
      const vnodeKey = `${node.id}#vn-${i}`;
      const hash = this.getHash(vnodeKey);
      const angleDeg = (hash / RING_SIZE) * 360;

      this.ring.push({
        hash,
        vnodeId: vnodeKey,
        nodeId: node.id,
        color: node.color,
        angleDeg,
        vnodeIndex: i,
      });
    }

    // Sort ring by hash ascending
    this.ring.sort((a, b) => a.hash - b.hash);
  }

  /**
   * Removes a physical node from the ring and cleans up its virtual nodes
   */
  public removeNode(nodeId: string): boolean {
    if (!this.physicalNodes.has(nodeId)) {
      return false;
    }

    this.physicalNodes.delete(nodeId);
    this.ring = this.ring.filter((vn) => vn.nodeId !== nodeId);
    return true;
  }

  /**
   * Updates an existing node's configuration (e.g. vnode count or color)
   */
  public updateNode(nodeId: string, updates: Partial<PhysicalNodeConfig>): void {
    const existing = this.physicalNodes.get(nodeId);
    if (!existing) return;

    const needsRingRebuild =
      updates.vnodeCount !== undefined && updates.vnodeCount !== existing.vnodeCount;

    Object.assign(existing, updates);

    if (needsRingRebuild) {
      this.rebuildRing();
    } else if (updates.color) {
      // update color in-place
      for (const vn of this.ring) {
        if (vn.nodeId === nodeId) {
          vn.color = updates.color;
        }
      }
    }
  }

  /**
   * Rebuilds all virtual nodes on the ring
   */
  private rebuildRing(): void {
    this.ring = [];
    for (const node of this.physicalNodes.values()) {
      const count = node.vnodeCount || this.defaultVnodeCount;
      for (let i = 0; i < count; i++) {
        const vnodeKey = `${node.id}#vn-${i}`;
        const hash = this.getHash(vnodeKey);
        const angleDeg = (hash / RING_SIZE) * 360;

        this.ring.push({
          hash,
          vnodeId: vnodeKey,
          nodeId: node.id,
          color: node.color,
          angleDeg,
          vnodeIndex: i,
        });
      }
    }
    this.ring.sort((a, b) => a.hash - b.hash);
  }

  /**
   * Routes a key clockwise to its target server node in O(log N) using Binary Search (Bisect / Upper-bound)
   */
  public getNode(key: string): KeyRouteResult | null {
    if (this.ring.length === 0 || this.physicalNodes.size === 0) {
      return null;
    }

    const hash = this.getHash(key);
    const angleDeg = (hash / RING_SIZE) * 360;

    // Binary search (Bisect right / Upper-bound)
    let low = 0;
    let high = this.ring.length - 1;
    let targetIdx = 0;
    let searchSteps = 0;

    // Boundary check: wrap around if greater than max hash in ring
    if (hash > this.ring[high].hash || hash <= this.ring[0].hash) {
      targetIdx = 0;
      searchSteps = 1;
    } else {
      while (low <= high) {
        searchSteps++;
        const mid = (low + high) >> 1;
        if (this.ring[mid].hash >= hash) {
          targetIdx = mid;
          high = mid - 1; // look for smaller index that is still >= hash
        } else {
          low = mid + 1;
        }
      }
    }

    const targetVNode = this.ring[targetIdx];
    const targetNode = this.physicalNodes.get(targetVNode.nodeId)!;

    // Calculate clockwise distance on the 2^32 ring
    const distance =
      targetVNode.hash >= hash
        ? targetVNode.hash - hash
        : RING_SIZE - hash + targetVNode.hash;

    return {
      key,
      hash,
      hashHex: '0x' + hash.toString(16).padStart(8, '0').toUpperCase(),
      angleDeg,
      targetNode,
      targetVNode,
      clockwiseDistance: distance,
      ringIndex: targetIdx,
      searchSteps,
      totalVnodes: this.ring.length,
    };
  }

  /**
   * Returns N distinct physical replicas for a key (Preference List for High Availability)
   */
  public getPreferenceList(key: string, replicaCount: number): PhysicalNodeConfig[] {
    if (this.ring.length === 0 || this.physicalNodes.size === 0) return [];

    const distinctNodes: PhysicalNodeConfig[] = [];
    const seenNodeIds = new Set<string>();

    const route = this.getNode(key);
    if (!route) return [];

    let idx = route.ringIndex;
    const ringLen = this.ring.length;
    let scanned = 0;

    while (
      distinctNodes.length < replicaCount &&
      distinctNodes.length < this.physicalNodes.size &&
      scanned < ringLen
    ) {
      const vnode = this.ring[idx];
      if (!seenNodeIds.has(vnode.nodeId)) {
        seenNodeIds.add(vnode.nodeId);
        const node = this.physicalNodes.get(vnode.nodeId);
        if (node && node.status === 'ACTIVE') {
          distinctNodes.push(node);
        }
      }
      idx = (idx + 1) % ringLen;
      scanned++;
    }

    return distinctNodes;
  }

  /**
   * Minimal Key Migration Calculus:
   * When topology changes (N -> N+1 or N -> N-1), calculates exactly how many keys need to move.
   * Theoretical expected migration ratio is 1 / N_new (or 1 / N_old).
   */
  public calculateMigration(
    existingKeys: string[],
    action: 'ADD_NODE' | 'REMOVE_NODE',
    targetNode: PhysicalNodeConfig
  ): MigrationPlan {
    const totalKeys = existingKeys.length;
    if (totalKeys === 0) {
      return {
        action,
        affectedNodeId: targetNode.id,
        totalKeys: 0,
        migratedKeysCount: 0,
        migrationRatio: 0,
        theoreticalRatio: 0,
        details: [],
      };
    }

    // Determine old assignments
    const oldAssignments = new Map<string, string>();
    for (const key of existingKeys) {
      const route = this.getNode(key);
      if (route) {
        oldAssignments.set(key, route.targetNode.id);
      }
    }

    // Temporarily apply action
    let newRing: ConsistentHashRing;
    if (action === 'ADD_NODE') {
      newRing = this.clone();
      newRing.addNode(targetNode);
    } else {
      newRing = this.clone();
      newRing.removeNode(targetNode.id);
    }

    const migrations: Array<{ key: string; fromNode: string; toNode: string }> = [];

    for (const key of existingKeys) {
      const oldNode = oldAssignments.get(key);
      const newRoute = newRing.getNode(key);
      const newNode = newRoute ? newRoute.targetNode.id : 'NONE';

      if (oldNode && newNode && oldNode !== newNode) {
        migrations.push({ key, fromNode: oldNode, toNode: newNode });
      }
    }

    const currentCount = this.physicalNodes.size;
    const theoreticalRatio =
      action === 'ADD_NODE'
        ? 1 / (currentCount + 1)
        : currentCount > 1
        ? 1 / currentCount
        : 1.0;

    return {
      action,
      affectedNodeId: targetNode.id,
      totalKeys,
      migratedKeysCount: migrations.length,
      migrationRatio: totalKeys > 0 ? migrations.length / totalKeys : 0,
      theoreticalRatio,
      details: migrations,
    };
  }

  /**
   * Evaluates key distribution balance across all physical shards.
   * Computes Chi-Squared (χ²) goodness-of-fit statistic to verify uniform distribution.
   */
  public evaluateDistribution(keys: string[]): {
    counts: Record<string, number>;
    percentages: Record<string, number>;
    chiSquared: number;
    degreesOfFreedom: number;
    isUniform: boolean;
    stdDev: number;
    mean: number;
  } {
    const counts: Record<string, number> = {};
    for (const node of this.physicalNodes.values()) {
      counts[node.id] = 0;
    }

    if (keys.length === 0 || this.physicalNodes.size === 0) {
      return {
        counts,
        percentages: {},
        chiSquared: 0,
        degreesOfFreedom: 0,
        isUniform: true,
        stdDev: 0,
        mean: 0,
      };
    }

    for (const key of keys) {
      const route = this.getNode(key);
      if (route && counts[route.targetNode.id] !== undefined) {
        counts[route.targetNode.id]++;
      }
    }

    const nodeCount = this.physicalNodes.size;
    const expectedPerNode = keys.length / nodeCount;
    let chiSquared = 0;
    let sumSquaredDiff = 0;
    const percentages: Record<string, number> = {};

    for (const [nodeId, count] of Object.entries(counts)) {
      percentages[nodeId] = (count / keys.length) * 100;
      const diff = count - expectedPerNode;
      sumSquaredDiff += diff * diff;
      chiSquared += (diff * diff) / expectedPerNode;
    }

    const variance = sumSquaredDiff / nodeCount;
    const stdDev = Math.sqrt(variance);

    // Critical Chi-square for 95% confidence with (k-1) degrees of freedom
    // For small cluster (3 to 10 nodes), a reasonable critical threshold is ~2 * df
    const degreesOfFreedom = Math.max(1, nodeCount - 1);
    const criticalValue = degreesOfFreedom * 2.5;
    const isUniform = chiSquared <= criticalValue;

    return {
      counts,
      percentages,
      chiSquared: Number(chiSquared.toFixed(2)),
      degreesOfFreedom,
      isUniform,
      stdDev: Number(stdDev.toFixed(2)),
      mean: Number(expectedPerNode.toFixed(1)),
    };
  }

  /**
   * Returns a snapshot of the ring topology
   */
  public getTopology() {
    return {
      vnodes: this.ring,
      nodes: Array.from(this.physicalNodes.values()),
      totalVnodes: this.ring.length,
      totalNodes: this.physicalNodes.size,
      hashAlgorithm: this.hashAlgorithm,
    };
  }

  /**
   * Clone current ring
   */
  public clone(): ConsistentHashRing {
    const ring = new ConsistentHashRing({
      hashAlgorithm: this.hashAlgorithm,
      defaultVnodeCount: this.defaultVnodeCount,
    });
    for (const node of this.physicalNodes.values()) {
      ring.addNode({ ...node });
    }
    return ring;
  }
}
