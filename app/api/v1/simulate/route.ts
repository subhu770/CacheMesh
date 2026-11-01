import { NextRequest, NextResponse } from 'next/server';
import { getMeshCluster } from '@/lib/mesh-cluster';

/**
 * POST /api/v1/simulate
 * Key Ingestion Simulator: Generates 100, 1,000, or 5,000 keys.
 * Calculates Chi-Squared variance, ops/sec throughput, and partition balance.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const count = Math.min(10000, Math.max(1, Number(body.count) || 1000));
    const pattern = body.pattern || 'uniform';
    const ttlMs = body.ttlMs ? Number(body.ttlMs) : undefined;

    const cluster = getMeshCluster();
    const result = cluster.simulateIngestion(count, pattern, ttlMs);
    const metrics = cluster.getMetrics();

    return NextResponse.json({
      success: true,
      simulation: result,
      metrics,
    });
  } catch (error: any) {
    console.error('Simulation error:', error);
    return NextResponse.json(
      { error: error?.message || 'Simulation execution failed' },
      { status: 500 }
    );
  }
}
