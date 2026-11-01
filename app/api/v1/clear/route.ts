import { NextResponse } from 'next/server';
import { getMeshCluster } from '@/lib/mesh-cluster';

export async function POST() {
  try {
    const cluster = getMeshCluster();
    cluster.clearAll();
    return NextResponse.json({
      success: true,
      message: 'All cache shards cleared',
      metrics: cluster.getMetrics(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to clear cluster' },
      { status: 500 }
    );
  }
}
