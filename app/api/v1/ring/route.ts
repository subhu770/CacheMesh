import { NextResponse } from 'next/server';
import { getMeshCluster } from '@/lib/mesh-cluster';

/**
 * GET /api/v1/ring
 * Returns ring topology, all virtual nodes, active keys, eviction event feed,
 * and cluster metrics for the 2D visualizer.
 */
export async function GET() {
  try {
    const cluster = getMeshCluster();
    const data = cluster.getVisualizerData();

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      ...data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch ring topology' },
      { status: 500 }
    );
  }
}
