import { NextRequest, NextResponse } from 'next/server';
import { getMeshCluster } from '@/lib/mesh-cluster';

/**
 * GET /api/v1/cache?key=foo
 * Routes key through consistent hash ring, queries target node shard,
 * tracks HIT/MISS, and returns payload with routing metadata.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { error: 'Missing required query parameter "key"' },
        { status: 400 }
      );
    }

    const cluster = getMeshCluster();
    const result = cluster.get(key);

    return NextResponse.json({
      success: true,
      key,
      hit: result.hit,
      value: result.value,
      expiresAt: result.expiresAt,
      accessCount: result.accessCount,
      latencyUs: result.latencyUs,
      routing: {
        hash: result.route.hash,
        hashHex: result.route.hashHex,
        angleDeg: Number(result.route.angleDeg.toFixed(2)),
        targetNode: {
          id: result.route.targetNode.id,
          name: result.route.targetNode.name,
          host: result.route.targetNode.host,
          port: result.route.targetNode.port,
          color: result.route.targetNode.color,
          policy: result.route.targetNode.policy,
        },
        targetVNode: {
          vnodeId: result.route.targetVNode.vnodeId,
          vnodeIndex: result.route.targetVNode.vnodeIndex,
          vnodeHash: result.route.targetVNode.hash,
        },
        binarySearchSteps: result.route.searchSteps,
        totalRingVnodes: result.route.totalVnodes,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal cache routing error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/cache
 * Accepts { key, value, ttlMs }
 * Writes to hash ring target shard with expiration timestamp and bounded capacity check.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value, ttlMs } = body;

    if (!key) {
      return NextResponse.json(
        { error: 'Missing required field "key"' },
        { status: 400 }
      );
    }

    if (value === undefined) {
      return NextResponse.json(
        { error: 'Missing required field "value"' },
        { status: 400 }
      );
    }

    const cluster = getMeshCluster();
    const parsedTtl = typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : undefined;

    const result = cluster.set(key, value, parsedTtl);

    return NextResponse.json({
      success: true,
      key,
      sizeBytes: result.sizeBytes,
      latencyUs: result.latencyUs,
      evicted: result.evicted,
      routing: {
        hash: result.route.hash,
        hashHex: result.route.hashHex,
        angleDeg: Number(result.route.angleDeg.toFixed(2)),
        targetNode: {
          id: result.route.targetNode.id,
          name: result.route.targetNode.name,
          color: result.route.targetNode.color,
          policy: result.route.targetNode.policy,
        },
        targetVNode: {
          vnodeId: result.route.targetVNode.vnodeId,
          vnodeIndex: result.route.targetVNode.vnodeIndex,
        },
        binarySearchSteps: result.route.searchSteps,
      },
      expiresAt: parsedTtl ? Date.now() + parsedTtl : null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to write cache entry' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/cache?key=foo
 * Invalidation endpoint
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { error: 'Missing required query parameter "key"' },
        { status: 400 }
      );
    }

    const cluster = getMeshCluster();
    const result = cluster.delete(key);

    return NextResponse.json({
      success: true,
      key,
      deleted: result.deleted,
      routedToNode: result.route ? result.route.targetNode.id : null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to invalidate cache entry' },
      { status: 500 }
    );
  }
}
