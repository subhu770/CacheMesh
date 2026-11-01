/**
 * CacheMesh In-Memory O(1) LRU & LFU Cache Shard Engine
 * 
 * Custom Doubly-Linked List + Hash Map implementation delivering guaranteed O(1)
 * get(key), set(key, value, ttlMs), and evict().
 * Supports both LRU (Least Recently Used) and LFU (Least Frequently Used with Frequency Buckets).
 * Enforces per-node bounded capacity (entry count & byte memory ceiling).
 */

export type EvictionPolicy = 'LRU' | 'LFU';

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  expiresAt: number | null; // Unix epoch ms, or null if no TTL
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  sizeBytes: number;
  // Doubly-Linked List pointers
  prev: CacheEntry<T> | null;
  next: CacheEntry<T> | null;
  freqBucket?: number; // Used for LFU
}

export interface EvictionEvent {
  id: string;
  timestamp: number;
  shardId: string;
  key: string;
  policy: EvictionPolicy;
  reason: 'CAPACITY_EXCEEDED' | 'MEMORY_SATURATION' | 'TTL_EXPIRED' | 'MANUAL';
  bytesReclaimed: number;
  accessCount: number;
  ttlRemainingMs: number | null;
}

export interface ShardStats {
  shardId: string;
  policy: EvictionPolicy;
  entryCount: number;
  maxEntries: number;
  usedMemoryBytes: number;
  maxMemoryBytes: number;
  memorySaturationPct: number;
  hits: number;
  misses: number;
  hitRatio: number;
  evictionCount: number;
  expiredCount: number;
  avgReadLatencyUs: number;
  avgWriteLatencyUs: number;
}

/**
 * Standard Doubly Linked List with Sentinel Head and Tail nodes.
 * Guarantees O(1) insertion, removal, and node relocation.
 */
export class DoublyLinkedList<T = unknown> {
  public head: CacheEntry<T>;
  public tail: CacheEntry<T>;
  public size: number = 0;

  constructor() {
    // Sentinels prevent boundary null-checks
    this.head = {
      key: '__SENTINEL_HEAD__',
      value: null as unknown as T,
      expiresAt: null,
      createdAt: 0,
      lastAccessedAt: 0,
      accessCount: 0,
      sizeBytes: 0,
      prev: null,
      next: null,
    };
    this.tail = {
      key: '__SENTINEL_TAIL__',
      value: null as unknown as T,
      expiresAt: null,
      createdAt: 0,
      lastAccessedAt: 0,
      accessCount: 0,
      sizeBytes: 0,
      prev: this.head,
      next: null,
    };
    this.head.next = this.tail;
  }

  /**
   * Adds entry right after sentinel head (Most Recently Used / Newest)
   */
  public addToHead(entry: CacheEntry<T>): void {
    entry.prev = this.head;
    entry.next = this.head.next;
    this.head.next!.prev = entry;
    this.head.next = entry;
    this.size++;
  }

  /**
   * Removes entry from arbitrary position in the list in O(1)
   */
  public removeNode(entry: CacheEntry<T>): void {
    if (!entry.prev || !entry.next) return;
    entry.prev.next = entry.next;
    entry.next.prev = entry.prev;
    entry.prev = null;
    entry.next = null;
    this.size--;
  }

  /**
   * Moves an existing entry in the list to the head (refresh recency)
   */
  public moveToHead(entry: CacheEntry<T>): void {
    this.removeNode(entry);
    this.addToHead(entry);
  }

  /**
   * Removes and returns the entry right before the sentinel tail (Least Recently Used)
   */
  public popTail(): CacheEntry<T> | null {
    if (this.size === 0 || this.tail.prev === this.head) {
      return null;
    }
    const lruNode = this.tail.prev!;
    this.removeNode(lruNode);
    return lruNode;
  }

  public isEmpty(): boolean {
    return this.size === 0;
  }
}

/**
 * Approximate memory footprint calculation for CacheMesh entries (bytes).
 * Takes into account UTF-16 string storage (2 bytes/char) and V8 node pointer overhead.
 */
export function estimateEntrySize(key: string, value: unknown): number {
  const keyBytes = key.length * 2;
  let valBytes = 16;
  try {
    if (typeof value === 'string') {
      valBytes = value.length * 2;
    } else if (typeof value === 'number') {
      valBytes = 8;
    } else if (typeof value === 'boolean') {
      valBytes = 4;
    } else if (value !== null && typeof value === 'object') {
      valBytes = JSON.stringify(value).length * 2;
    }
  } catch {
    valBytes = 64;
  }
  // V8 Doubly-Linked Node overhead: pointers (prev, next), numbers (createdAt, lastAccessed, etc.) ~128 bytes
  return keyBytes + valBytes + 128;
}

/**
 * Individual In-Memory Cache Shard.
 * Provides O(1) LRU or LFU cache with bounded capacity and memory ceiling.
 */
export class CacheShard<T = unknown> {
  public readonly shardId: string;
  private policy: EvictionPolicy;
  private maxEntries: number;
  private maxMemoryBytes: number;
  private usedMemoryBytes: number = 0;

  // Primary Hash Map for O(1) lookup
  private entryMap: Map<string, CacheEntry<T>> = new Map();

  // LRU Doubly-Linked List (Sentinel Head to Sentinel Tail)
  private lruList: DoublyLinkedList<T> = new DoublyLinkedList<T>();

  // LFU Frequency Buckets: Map<frequency, DoublyLinkedList>
  private freqBuckets: Map<number, DoublyLinkedList<T>> = new Map();
  private minFreq: number = 0;

  // Shard Telemetry
  private hits: number = 0;
  private misses: number = 0;
  private evictionCount: number = 0;
  private expiredCount: number = 0;
  private readLatencies: number[] = [];
  private writeLatencies: number[] = [];
  private recentEvictions: EvictionEvent[] = [];

  constructor(options: {
    shardId: string;
    policy?: EvictionPolicy;
    maxEntries?: number;
    maxMemoryMB?: number;
  }) {
    this.shardId = options.shardId;
    this.policy = options.policy ?? 'LRU';
    this.maxEntries = options.maxEntries ?? 5000;
    // Default 10MB per shard
    this.maxMemoryBytes = (options.maxMemoryMB ?? 10) * 1024 * 1024;
  }

  /**
   * Retrieves an item in O(1) time.
   * If item has expired, passively purges it and returns null.
   */
  public get(key: string): { entry: CacheEntry<T> | null; hit: boolean; latencyUs: number } {
    const start = performance.now();
    const entry = this.entryMap.get(key);

    if (!entry) {
      this.misses++;
      const latencyUs = Math.round((performance.now() - start) * 1000);
      this.recordReadLatency(latencyUs);
      return { entry: null, hit: false, latencyUs };
    }

    const now = Date.now();

    // Check TTL Expiration
    if (entry.expiresAt !== null && entry.expiresAt <= now) {
      this.expiredCount++;
      this.delete(key, 'TTL_EXPIRED');
      this.misses++;
      const latencyUs = Math.round((performance.now() - start) * 1000);
      this.recordReadLatency(latencyUs);
      return { entry: null, hit: false, latencyUs };
    }

    // Cache HIT
    this.hits++;
    entry.lastAccessedAt = now;
    entry.accessCount++;

    // Update eviction structures in O(1)
    if (this.policy === 'LRU') {
      this.lruList.moveToHead(entry);
    } else {
      this.updateLFUFrequency(entry);
    }

    const latencyUs = Math.round((performance.now() - start) * 1000);
    this.recordReadLatency(latencyUs);

    return { entry, hit: true, latencyUs };
  }

  /**
   * Inserts or updates an entry in O(1) time.
   * Enforces capacity and memory limits via automatic eviction.
   */
  public set(
    key: string,
    value: T,
    ttlMs?: number
  ): { evicted: EvictionEvent | null; latencyUs: number; sizeBytes: number } {
    const start = performance.now();
    const now = Date.now();
    const expiresAt = ttlMs && ttlMs > 0 ? now + ttlMs : null;
    const newSizeBytes = estimateEntrySize(key, value);

    let evictedEvent: EvictionEvent | null = null;
    const existing = this.entryMap.get(key);

    if (existing) {
      // Update existing entry
      this.usedMemoryBytes -= existing.sizeBytes;
      existing.value = value;
      existing.expiresAt = expiresAt;
      existing.lastAccessedAt = now;
      existing.accessCount++;
      existing.sizeBytes = newSizeBytes;
      this.usedMemoryBytes += newSizeBytes;

      if (this.policy === 'LRU') {
        this.lruList.moveToHead(existing);
      } else {
        this.updateLFUFrequency(existing);
      }
    } else {
      // Evict if at capacity limit or memory saturation
      while (
        this.entryMap.size >= this.maxEntries ||
        (this.usedMemoryBytes + newSizeBytes > this.maxMemoryBytes && this.entryMap.size > 0)
      ) {
        const reason =
          this.entryMap.size >= this.maxEntries
            ? 'CAPACITY_EXCEEDED'
            : 'MEMORY_SATURATION';
        const ev = this.evict(reason);
        if (ev && !evictedEvent) {
          evictedEvent = ev;
        }
        if (!ev) break; // Safeguard
      }

      // Create new CacheEntry
      const entry: CacheEntry<T> = {
        key,
        value,
        expiresAt,
        createdAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        sizeBytes: newSizeBytes,
        prev: null,
        next: null,
        freqBucket: 1,
      };

      this.entryMap.set(key, entry);
      this.usedMemoryBytes += newSizeBytes;

      if (this.policy === 'LRU') {
        this.lruList.addToHead(entry);
      } else {
        this.insertLFUNewNode(entry);
      }
    }

    const latencyUs = Math.round((performance.now() - start) * 1000);
    this.recordWriteLatency(latencyUs);

    return { evicted: evictedEvent, latencyUs, sizeBytes: newSizeBytes };
  }

  /**
   * Deletes a key from the shard in O(1) time
   */
  public delete(
    key: string,
    reason: EvictionEvent['reason'] = 'MANUAL'
  ): EvictionEvent | null {
    const entry = this.entryMap.get(key);
    if (!entry) return null;

    if (this.policy === 'LRU') {
      this.lruList.removeNode(entry);
    } else {
      const bucket = this.freqBuckets.get(entry.freqBucket || 1);
      if (bucket) {
        bucket.removeNode(entry);
        if (bucket.isEmpty()) {
          this.freqBuckets.delete(entry.freqBucket || 1);
        }
      }
    }

    this.entryMap.delete(key);
    this.usedMemoryBytes = Math.max(0, this.usedMemoryBytes - entry.sizeBytes);

    const event: EvictionEvent = {
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      shardId: this.shardId,
      key,
      policy: this.policy,
      reason,
      bytesReclaimed: entry.sizeBytes,
      accessCount: entry.accessCount,
      ttlRemainingMs:
        entry.expiresAt !== null ? Math.max(0, entry.expiresAt - Date.now()) : null,
    };

    if (reason !== 'MANUAL') {
      this.evictionCount++;
      this.logEviction(event);
    }

    return event;
  }

  /**
   * Evicts one entry according to current policy (LRU or LFU) in O(1) time
   */
  public evict(reason: EvictionEvent['reason'] = 'CAPACITY_EXCEEDED'): EvictionEvent | null {
    if (this.entryMap.size === 0) return null;

    let evictedNode: CacheEntry<T> | null = null;

    if (this.policy === 'LRU') {
      // Pop tail of LRU list
      evictedNode = this.lruList.popTail();
    } else {
      // LFU: Evict the least recently used node from the minimum frequency bucket
      const minBucket = this.freqBuckets.get(this.minFreq);
      if (minBucket) {
        evictedNode = minBucket.popTail();
        if (minBucket.isEmpty()) {
          this.freqBuckets.delete(this.minFreq);
        }
      }
    }

    if (!evictedNode) {
      // Fallback: pick any entry if structures are out of sync
      const firstKey = this.entryMap.keys().next().value;
      if (firstKey) {
        return this.delete(firstKey, reason);
      }
      return null;
    }

    this.entryMap.delete(evictedNode.key);
    this.usedMemoryBytes = Math.max(0, this.usedMemoryBytes - evictedNode.sizeBytes);
    this.evictionCount++;

    const event: EvictionEvent = {
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      shardId: this.shardId,
      key: evictedNode.key,
      policy: this.policy,
      reason,
      bytesReclaimed: evictedNode.sizeBytes,
      accessCount: evictedNode.accessCount,
      ttlRemainingMs:
        evictedNode.expiresAt !== null
          ? Math.max(0, evictedNode.expiresAt - Date.now())
          : null,
    };

    this.logEviction(event);
    return event;
  }

  /**
   * LFU Helper: Promotes a node to frequency f + 1 in O(1)
   */
  private updateLFUFrequency(entry: CacheEntry<T>): void {
    const curFreq = entry.freqBucket ?? 1;
    const curBucket = this.freqBuckets.get(curFreq);

    if (curBucket) {
      curBucket.removeNode(entry);
      if (curBucket.isEmpty()) {
        this.freqBuckets.delete(curFreq);
        if (this.minFreq === curFreq) {
          this.minFreq = curFreq + 1;
        }
      }
    }

    const nextFreq = curFreq + 1;
    entry.freqBucket = nextFreq;

    if (!this.freqBuckets.has(nextFreq)) {
      this.freqBuckets.set(nextFreq, new DoublyLinkedList<T>());
    }
    this.freqBuckets.get(nextFreq)!.addToHead(entry);
  }

  /**
   * LFU Helper: Inserts a newly added node into frequency bucket 1 in O(1)
   */
  private insertLFUNewNode(entry: CacheEntry<T>): void {
    entry.freqBucket = 1;
    this.minFreq = 1;

    if (!this.freqBuckets.has(1)) {
      this.freqBuckets.set(1, new DoublyLinkedList<T>());
    }
    this.freqBuckets.get(1)!.addToHead(entry);
  }

  /**
   * Sweeps expired entries (Active TTL Reclamation)
   */
  public purgeExpired(batchLimit: number = 100): number {
    const now = Date.now();
    let purged = 0;

    for (const [key, entry] of this.entryMap.entries()) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.delete(key, 'TTL_EXPIRED');
        this.expiredCount++;
        purged++;
        if (purged >= batchLimit) break;
      }
    }

    return purged;
  }

  /**
   * Dynamically switch policy between LRU and LFU
   */
  public setPolicy(policy: EvictionPolicy): void {
    if (this.policy === policy) return;
    this.policy = policy;

    // Reconstruct list or frequency buckets
    if (policy === 'LFU') {
      this.freqBuckets.clear();
      this.minFreq = 1;
      for (const entry of this.entryMap.values()) {
        const freq = entry.accessCount || 1;
        entry.freqBucket = freq;
        if (!this.freqBuckets.has(freq)) {
          this.freqBuckets.set(freq, new DoublyLinkedList<T>());
        }
        this.freqBuckets.get(freq)!.addToHead(entry);
      }
    } else {
      // LRU: reconstruct DLL based on lastAccessedAt
      this.lruList = new DoublyLinkedList<T>();
      const sortedEntries = Array.from(this.entryMap.values()).sort(
        (a, b) => b.lastAccessedAt - a.lastAccessedAt
      );
      for (const entry of sortedEntries) {
        this.lruList.addToHead(entry);
      }
    }
  }

  public setMaxEntries(count: number): void {
    this.maxEntries = Math.max(10, count);
    while (this.entryMap.size > this.maxEntries) {
      this.evict('CAPACITY_EXCEEDED');
    }
  }

  public setMaxMemoryMB(mb: number): void {
    this.maxMemoryBytes = Math.max(1, mb) * 1024 * 1024;
    while (this.usedMemoryBytes > this.maxMemoryBytes && this.entryMap.size > 0) {
      this.evict('MEMORY_SATURATION');
    }
  }

  private logEviction(event: EvictionEvent): void {
    this.recentEvictions.unshift(event);
    if (this.recentEvictions.length > 50) {
      this.recentEvictions.pop();
    }
  }

  private recordReadLatency(us: number): void {
    this.readLatencies.push(us);
    if (this.readLatencies.length > 100) this.readLatencies.shift();
  }

  private recordWriteLatency(us: number): void {
    this.writeLatencies.push(us);
    if (this.writeLatencies.length > 100) this.writeLatencies.shift();
  }

  public getStats(): ShardStats {
    const totalRequests = this.hits + this.misses;
    const hitRatio = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;
    const avgRead =
      this.readLatencies.length > 0
        ? this.readLatencies.reduce((a, b) => a + b, 0) / this.readLatencies.length
        : 0;
    const avgWrite =
      this.writeLatencies.length > 0
        ? this.writeLatencies.reduce((a, b) => a + b, 0) / this.writeLatencies.length
        : 0;

    return {
      shardId: this.shardId,
      policy: this.policy,
      entryCount: this.entryMap.size,
      maxEntries: this.maxEntries,
      usedMemoryBytes: this.usedMemoryBytes,
      maxMemoryBytes: this.maxMemoryBytes,
      memorySaturationPct:
        this.maxMemoryBytes > 0
          ? Number(((this.usedMemoryBytes / this.maxMemoryBytes) * 100).toFixed(2))
          : 0,
      hits: this.hits,
      misses: this.misses,
      hitRatio: Number(hitRatio.toFixed(1)),
      evictionCount: this.evictionCount,
      expiredCount: this.expiredCount,
      avgReadLatencyUs: Number(avgRead.toFixed(1)),
      avgWriteLatencyUs: Number(avgWrite.toFixed(1)),
    };
  }

  public getRecentEvictions(): EvictionEvent[] {
    return [...this.recentEvictions];
  }

  public getAllKeys(): string[] {
    return Array.from(this.entryMap.keys());
  }

  public getSampleEntries(limit: number = 10): Array<{
    key: string;
    valuePreview: string;
    sizeBytes: number;
    accessCount: number;
    ttlMsRemaining: number | null;
  }> {
    const now = Date.now();
    const result: Array<{
      key: string;
      valuePreview: string;
      sizeBytes: number;
      accessCount: number;
      ttlMsRemaining: number | null;
    }> = [];

    let count = 0;
    for (const [key, entry] of this.entryMap.entries()) {
      if (count >= limit) break;
      let preview = '';
      try {
        preview =
          typeof entry.value === 'object'
            ? JSON.stringify(entry.value).slice(0, 40)
            : String(entry.value).slice(0, 40);
      } catch {
        preview = '[Object]';
      }

      result.push({
        key,
        valuePreview: preview,
        sizeBytes: entry.sizeBytes,
        accessCount: entry.accessCount,
        ttlMsRemaining:
          entry.expiresAt !== null ? Math.max(0, entry.expiresAt - now) : null,
      });
      count++;
    }

    return result;
  }
}
