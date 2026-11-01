import { NextRequest, NextResponse } from 'next/server';
import { getMeshCluster } from '@/lib/mesh-cluster';
import { PhysicalNodeConfig } from '@/lib/consistent-hash';

/**
 * GET /api/v1/nodes
 * Retrieves all physical cache server nodes, shard capacities, and telemetry.
 */
export async function GET() {
  try {
    const cluster = getMeshCluster();
    const metrics = cluster.getMetrics();
    const visualizer = cluster.getVisualizerData();

    return NextResponse.json({
      success: true,
      nodes: visualizer.nodes,
      shards: metrics.shards,
      totalVnodes: metrics.totalVnodes,
      lastMigration: visualizer.lastMigration,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to list nodes' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/nodes
 * Add or drain a physical server node dynamically to simulate live rebalancing
 * Returns minimal key migration calculus (only K/N keys moved).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, node, nodeId } = body;

    const cluster = getMeshCluster();

    if (action === 'add') {
      if (!node || !node.id || !node.name) {
        return NextResponse.json(
          { error: 'Missing node definition: id and name are required' },
          { status: 400 }
        );
      }

      const nodeConfig: PhysicalNodeConfig = {
        id: node.id.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
        name: node.name,
        host: node.host || '127.0.0.1',
        port: node.port || 6379,
        vnodeCount: Math.max(10, Math.min(500, Number(node.vnodeCount) || 100)),
        color: node.color || '#ec4899',
        status: 'ACTIVE',
        policy: node.policy === 'LFU' ? 'LFU' : 'LRU',
        maxEntries: Number(node.maxEntries) || 2000,
        maxMemoryMB: Number(node.maxMemoryMB) || 10,
      };

      const migration = cluster.addPhysicalNode(nodeConfig, true);

      return NextResponse.json({
        success: true,
        action: 'add',
        node: nodeConfig,
        migration,
        metrics: cluster.getMetrics(),
      });
    }

    if (action === 'drain' || action === 'remove') {
      const targetId = nodeId || (node && node.id);
      if (!targetId) {
        return NextResponse.json(
          { error: 'Missing nodeId for drain/remove action' },
          { status: 400 }
        );
      }

      const migration = cluster.removePhysicalNode(targetId);

      return NextResponse.json({
        success: true,
        action: 'drain',
        drainedNodeId: targetId,
        migration,
        metrics: cluster.getMetrics(),
      });
    }

    return NextResponse.json(
      { error: `Unknown action "${action}". Allowed: "add", "drain", "remove"` },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to execute node operation' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v1/nodes
 * Updates node parameters (e.g. vnode count, policy, color)
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { nodeId, policy, vnodeCount, maxEntries, maxMemoryMB, color } = body;

    if (!nodeId) {
      return NextResponse.json(
        { error: 'Missing required field "nodeId"' },
        { status: 400 }
      );
    }

    const cluster = getMeshCluster();
    cluster.updateShardConfig(nodeId, {
      policy,
      vnodeCount: vnodeCount ? Number(vnodeCount) : undefined,
      maxEntries: maxEntries ? Number(maxEntries) : undefined,
      maxMemoryMB: maxMemoryMB ? Number(maxMemoryMB) : undefined,
      color,
    });

    return NextResponse.json({
      success: true,
      nodeId,
      metrics: cluster.getMetrics(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update node configuration' },
      { status: 500 }
    );
  }
}
