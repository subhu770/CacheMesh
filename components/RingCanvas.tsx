'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { VirtualNode, PhysicalNodeConfig } from '@/lib/consistent-hash';
import { Layers, Key, Compass, RotateCw, ZoomIn, ZoomOut, Eye, Sparkles } from 'lucide-react';

interface MappedKey {
  key: string;
  hash: number;
  angleDeg: number;
  targetNodeId: string;
  color: string;
}

interface RingCanvasProps {
  vnodes: VirtualNode[];
  nodes: PhysicalNodeConfig[];
  keys: MappedKey[];
  activeRouteTrace?: {
    key: string;
    hash: number;
    angleDeg: number;
    targetNodeId: string;
    vnodeId: string;
    searchSteps: number;
    timestamp: number;
  } | null;
  onSelectNode?: (nodeId: string | null) => void;
  selectedNodeId?: string | null;
}

export function RingCanvas({
  vnodes,
  nodes,
  keys,
  activeRouteTrace,
  onSelectNode,
  selectedNodeId,
}: RingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredVNode, setHoveredVNode] = useState<VirtualNode | null>(null);
  const [hoveredKey, setHoveredKey] = useState<MappedKey | null>(null);
  const [clickedCoord, setClickedCoord] = useState<{ angleDeg: number; hash: number; ownerNode?: string } | null>(null);
  const [showVnodes, setShowVnodes] = useState<boolean>(true);
  const [showKeys, setShowKeys] = useState<boolean>(true);
  const [showArcs, setShowArcs] = useState<boolean>(true);
  const [animationTick, setAnimationTick] = useState<number>(0);

  // Map node ID to its config for rapid lookup
  const nodeMap = useMemo(() => {
    const map = new Map<string, PhysicalNodeConfig>();
    for (const n of nodes) {
      map.set(n.id, n);
    }
    return map;
  }, [nodes]);

  // Compute ring segments (ownership arcs)
  // In consistent hashing, each vnode owns the segment clockwise from the previous vnode to itself!
  const ownershipSegments = useMemo(() => {
    if (vnodes.length === 0) return [];
    const segments: Array<{
      startAngle: number;
      endAngle: number;
      vnode: VirtualNode;
      node: PhysicalNodeConfig | undefined;
    }> = [];

    const total = vnodes.length;
    for (let i = 0; i < total; i++) {
      const cur = vnodes[i];
      const prev = vnodes[(i - 1 + total) % total];
      const startAngle = prev.angleDeg;
      const endAngle = cur.angleDeg;
      segments.push({
        startAngle,
        endAngle,
        vnode: cur,
        node: nodeMap.get(cur.nodeId),
      });
    }
    return segments;
  }, [vnodes, nodeMap]);

  // Animation loop for route trace pulses and glowing perimeter
  useEffect(() => {
    let animId: number;
    const animate = () => {
      setAnimationTick((t) => t + 1);
      animId = requestAnimationFrame(animate);
    };
    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Main Canvas Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Retina display scaling
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const ringRadius = Math.min(width, height) * 0.38;
    const keyOrbitRadius = ringRadius - 26;
    const vnodeOrbitRadius = ringRadius;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw outer background glow
    const radialGlow = ctx.createRadialGradient(
      centerX,
      centerY,
      ringRadius * 0.2,
      centerX,
      centerY,
      ringRadius * 1.3
    );
    radialGlow.addColorStop(0, 'rgba(15, 23, 42, 0.4)');
    radialGlow.addColorStop(0.7, 'rgba(15, 23, 42, 0.1)');
    radialGlow.addColorStop(1, 'rgba(6, 9, 17, 0)');
    ctx.fillStyle = radialGlow;
    ctx.beginPath();
    ctx.arc(centerX, centerY, ringRadius * 1.3, 0, Math.PI * 2);
    ctx.fill();

    // 2. Draw circular grid lines & hash markings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, keyOrbitRadius, 0, Math.PI * 2);
    ctx.stroke();

    // 3. Draw Cardinal Hash points (0, 2^31, etc.)
    const cardinalHashes = [
      { deg: 0, label: '0 (0x00000000)' },
      { deg: 90, label: '2³⁰ (0x40000000)' },
      { deg: 180, label: '2³¹ (0x80000000)' },
      { deg: 270, label: '3·2³⁰ (0xC0000000)' },
    ];

    ctx.fillStyle = '#64748b';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const card of cardinalHashes) {
      // 0 deg is at top (12 o'clock, so angle - 90 deg in standard canvas)
      const rad = ((card.deg - 90) * Math.PI) / 180;
      const x1 = centerX + Math.cos(rad) * (ringRadius + 8);
      const y1 = centerY + Math.sin(rad) * (ringRadius + 8);
      const x2 = centerX + Math.cos(rad) * (ringRadius + 18);
      const y2 = centerY + Math.sin(rad) * (ringRadius + 18);

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const labelX = centerX + Math.cos(rad) * (ringRadius + 32);
      const labelY = centerY + Math.sin(rad) * (ringRadius + 32);
      ctx.fillText(card.label, labelX, labelY);
    }

    // 4. Draw Ownership Arcs (if enabled or if node selected)
    if (showArcs && ownershipSegments.length > 0) {
      for (const seg of ownershipSegments) {
        const isNodeHighlighted =
          selectedNodeId === seg.vnode.nodeId ||
          (hoveredVNode && hoveredVNode.nodeId === seg.vnode.nodeId);

        let startRad = ((seg.startAngle - 90) * Math.PI) / 180;
        let endRad = ((seg.endAngle - 90) * Math.PI) / 180;

        // Wrap around boundary check
        if (seg.endAngle < seg.startAngle) {
          endRad += Math.PI * 2;
        }

        ctx.beginPath();
        ctx.arc(centerX, centerY, ringRadius, startRad, endRad);
        const nodeColor = seg.node ? seg.node.color : '#64748b';

        if (isNodeHighlighted) {
          ctx.strokeStyle = nodeColor;
          ctx.lineWidth = 5;
          ctx.shadowColor = nodeColor;
          ctx.shadowBlur = 12;
        } else {
          // Subtle faint arc
          ctx.strokeStyle = `${nodeColor}40`;
          ctx.lineWidth = 2;
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    // 5. Draw Virtual Nodes (ticks / dots)
    if (showVnodes && vnodes.length > 0) {
      const step = vnodes.length > 300 ? 1 : 1;
      for (let i = 0; i < vnodes.length; i += step) {
        const vn = vnodes[i];
        const rad = ((vn.angleDeg - 90) * Math.PI) / 180;
        const isHovered = hoveredVNode?.vnodeId === vn.vnodeId;
        const isSelected = selectedNodeId === vn.nodeId;

        const x = centerX + Math.cos(rad) * vnodeOrbitRadius;
        const y = centerY + Math.sin(rad) * vnodeOrbitRadius;

        ctx.beginPath();
        if (isHovered || isSelected) {
          ctx.arc(x, y, isHovered ? 5.5 : 4, 0, Math.PI * 2);
          ctx.fillStyle = vn.color;
          ctx.shadowColor = vn.color;
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fillStyle = `${vn.color}cc`;
          ctx.fill();
        }
      }
    }

    // 6. Draw Mapped Keys
    if (showKeys && keys.length > 0) {
      for (const k of keys) {
        const rad = ((k.angleDeg - 90) * Math.PI) / 180;
        const x = centerX + Math.cos(rad) * keyOrbitRadius;
        const y = centerY + Math.sin(rad) * keyOrbitRadius;
        const isHovered = hoveredKey?.key === k.key;

        ctx.beginPath();
        if (isHovered) {
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = 12;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = k.color || '#38bdf8';
          ctx.fill();
        }
      }
    }

    // 7. Draw Active Route Trace Animation (Clockwise Sweep)
    if (activeRouteTrace) {
      const elapsed = (Date.now() - activeRouteTrace.timestamp) / 1000;
      if (elapsed < 5) {
        const keyRad = ((activeRouteTrace.angleDeg - 90) * Math.PI) / 180;
        const keyX = centerX + Math.cos(keyRad) * keyOrbitRadius;
        const keyY = centerY + Math.sin(keyRad) * keyOrbitRadius;

        // Key hash beacon
        const pulse = (Math.sin(animationTick * 0.15) + 1) / 2;
        ctx.beginPath();
        ctx.arc(keyX, keyY, 6 + pulse * 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(keyX, keyY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();

        // Target VNode
        const targetVn = vnodes.find((v) => v.vnodeId === activeRouteTrace.vnodeId);
        if (targetVn) {
          const targetRad = ((targetVn.angleDeg - 90) * Math.PI) / 180;
          const targetX = centerX + Math.cos(targetRad) * vnodeOrbitRadius;
          const targetY = centerY + Math.sin(targetRad) * vnodeOrbitRadius;

          // Clockwise sweep arc
          let startA = keyRad;
          let endA = targetRad;
          if (endA < startA) endA += Math.PI * 2;

          ctx.beginPath();
          ctx.arc(centerX, centerY, ringRadius, startA, endA);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 3;
          ctx.setLineDash([4, 4]);
          ctx.lineDashOffset = -animationTick * 1.5;
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 10;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.shadowBlur = 0;

          // Target node beacon
          ctx.beginPath();
          ctx.arc(targetX, targetY, 7 + pulse * 5, 0, Math.PI * 2);
          ctx.strokeStyle = targetVn.color;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }
    }

    // 8. Ring Center Information HUD
    const activePhysicalCount = nodes.filter((n) => n.status === 'ACTIVE').length;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText('32-BIT INTEGER RING', centerX, centerY - 32);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`${vnodes.length} VNODES`, centerX, centerY - 8);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillText(`${activePhysicalCount} PHYSICAL SHARDS`, centerX, centerY + 18);

    ctx.fillStyle = '#64748b';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('[0, 4,294,967,295]', centerX, centerY + 36);

  }, [
    vnodes,
    nodes,
    keys,
    ownershipSegments,
    hoveredVNode,
    hoveredKey,
    selectedNodeId,
    showVnodes,
    showKeys,
    showArcs,
    activeRouteTrace,
    animationTick,
  ]);

  // Handle canvas mouse move for interactive hovering
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const dx = x - centerX;
    const dy = y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ringRadius = Math.min(rect.width, rect.height) * 0.38;

    // Convert mouse angle to [0, 360] degrees clockwise from top (12 o'clock)
    let angleRad = Math.atan2(dy, dx) + Math.PI / 2;
    if (angleRad < 0) angleRad += Math.PI * 2;
    const angleDeg = (angleRad * 180) / Math.PI;

    // Check proximity to virtual node orbit
    if (Math.abs(dist - ringRadius) < 18 && vnodes.length > 0) {
      // Find closest vnode by angle
      let closestVn: VirtualNode | null = null;
      let minDiff = 360;

      for (const vn of vnodes) {
        let diff = Math.abs(vn.angleDeg - angleDeg);
        if (diff > 180) diff = 360 - diff;
        if (diff < minDiff && diff < 3) {
          minDiff = diff;
          closestVn = vn;
        }
      }
      setHoveredVNode(closestVn);
      setHoveredKey(null);
      return;
    }

    // Check proximity to key orbit
    const keyOrbitRadius = ringRadius - 26;
    if (Math.abs(dist - keyOrbitRadius) < 12 && keys.length > 0) {
      let closestK: MappedKey | null = null;
      let minDiff = 360;

      for (const k of keys) {
        let diff = Math.abs(k.angleDeg - angleDeg);
        if (diff > 180) diff = 360 - diff;
        if (diff < minDiff && diff < 4) {
          minDiff = diff;
          closestK = k;
        }
      }
      setHoveredKey(closestK);
      setHoveredVNode(null);
      return;
    }

    setHoveredVNode(null);
    setHoveredKey(null);
  };

  // Handle canvas click to query arbitrary hash coordinate on ring
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const dx = x - centerX;
    const dy = y - centerY;

    let angleRad = Math.atan2(dy, dx) + Math.PI / 2;
    if (angleRad < 0) angleRad += Math.PI * 2;
    const angleDeg = (angleRad * 180) / Math.PI;

    // Calculate corresponding 32-bit hash
    const hash = Math.round((angleDeg / 360) * 4294967296);

    // Find clockwise owner vnode
    let ownerNodeId: string | undefined;
    for (const seg of ownershipSegments) {
      if (seg.startAngle <= seg.endAngle) {
        if (angleDeg >= seg.startAngle && angleDeg <= seg.endAngle) {
          ownerNodeId = seg.vnode.nodeId;
          break;
        }
      } else {
        // Wrap around 360 -> 0
        if (angleDeg >= seg.startAngle || angleDeg <= seg.endAngle) {
          ownerNodeId = seg.vnode.nodeId;
          break;
        }
      }
    }

    setClickedCoord({
      angleDeg: Number(angleDeg.toFixed(2)),
      hash,
      ownerNode: ownerNodeId ? nodeMap.get(ownerNodeId)?.name : 'Unknown',
    });

    if (ownerNodeId && onSelectNode) {
      onSelectNode(ownerNodeId);
    }
  };

  return (
    <div className="relative flex flex-col items-center w-full glass-panel rounded-2xl p-6 border border-slate-800 shadow-2xl">
      {/* Visualizer Header Controls */}
      <div className="w-full flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Compass className="w-5 h-5 animate-spin-slow" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              Consistent Hashing Ring
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-mono">
                360° Murmur3 Ring
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Interactive 32-bit integer circular keyspace mapping [0, 2³² - 1]
            </p>
          </div>
        </div>

        {/* Visibility Toggles */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArcs(!showArcs)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              showArcs
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Shard Arcs
          </button>
          <button
            onClick={() => setShowVnodes(!showVnodes)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              showVnodes
                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            VNodes ({vnodes.length})
          </button>
          <button
            onClick={() => setShowKeys(!showKeys)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              showKeys
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            Keys ({keys.length})
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="relative w-full aspect-square max-w-[580px] my-4 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {
            setHoveredVNode(null);
            setHoveredKey(null);
          }}
          onClick={handleCanvasClick}
          className="w-full h-full cursor-crosshair drop-shadow-[0_0_35px_rgba(6,182,212,0.15)]"
        />

        {/* Hover Tooltip for VNode */}
        {hoveredVNode && (
          <div className="absolute top-4 left-4 pointer-events-none glass-panel p-3 rounded-xl border border-cyan-500/40 shadow-xl max-w-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: hoveredVNode.color }}
              />
              <span className="text-xs font-bold text-slate-100 font-mono">
                {hoveredVNode.vnodeId}
              </span>
            </div>
            <div className="space-y-0.5 text-[11px] font-mono text-slate-300">
              <div>Owner Node: <span className="text-cyan-300 font-bold">{nodeMap.get(hoveredVNode.nodeId)?.name}</span></div>
              <div>Hash (Uint32): <span className="text-slate-100">{hoveredVNode.hash.toLocaleString()}</span></div>
              <div>Hash (Hex): <span className="text-slate-400">0x{hoveredVNode.hash.toString(16).padStart(8, '0').toUpperCase()}</span></div>
              <div>Ring Angle: <span className="text-amber-300">{hoveredVNode.angleDeg.toFixed(2)}°</span></div>
            </div>
          </div>
        )}

        {/* Hover Tooltip for Key */}
        {hoveredKey && (
          <div className="absolute bottom-4 left-4 pointer-events-none glass-panel p-3 rounded-xl border border-emerald-500/40 shadow-xl max-w-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2 mb-1.5">
              <Key className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-bold text-slate-100 font-mono">
                {hoveredKey.key}
              </span>
            </div>
            <div className="space-y-0.5 text-[11px] font-mono text-slate-300">
              <div>Routed Shard: <span className="text-emerald-300 font-bold">{nodeMap.get(hoveredKey.targetNodeId)?.name}</span></div>
              <div>Hash: <span className="text-slate-100">{hoveredKey.hash.toLocaleString()}</span></div>
              <div>Position: <span className="text-amber-300">{hoveredKey.angleDeg.toFixed(2)}°</span></div>
            </div>
          </div>
        )}

        {/* Click Probe HUD */}
        {clickedCoord && (
          <div className="absolute bottom-4 right-4 glass-panel p-3 rounded-xl border border-slate-700/80 shadow-xl max-w-xs text-[11px] font-mono">
            <div className="text-xs font-bold text-cyan-400 mb-1 flex items-center justify-between">
              <span>Ring Coordinate Probe</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setClickedCoord(null);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="text-slate-300">Angle: <span className="text-amber-300">{clickedCoord.angleDeg}°</span></div>
            <div className="text-slate-300">Hash: <span className="text-slate-100">{clickedCoord.hash.toLocaleString()}</span></div>
            <div className="text-slate-300">Clockwise Target: <span className="text-cyan-300 font-bold">{clickedCoord.ownerNode}</span></div>
          </div>
        )}
      </div>

      {/* Ring Topology Legend */}
      <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-800/80">
        {nodes.map((node) => {
          const isSelected = selectedNodeId === node.id;
          return (
            <button
              key={node.id}
              onClick={() => onSelectNode && onSelectNode(isSelected ? null : node.id)}
              className={`p-2.5 rounded-xl border transition-all text-left flex items-center justify-between ${
                isSelected
                  ? 'border-cyan-500 bg-cyan-950/30'
                  : 'border-slate-800/80 bg-slate-900/40 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shadow-sm"
                  style={{ backgroundColor: node.color }}
                />
                <div>
                  <div className="text-xs font-semibold text-slate-200">{node.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {node.vnodeCount} vnodes • {node.policy || 'LRU'}
                  </div>
                </div>
              </div>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  node.status === 'ACTIVE'
                    ? 'text-emerald-400 bg-emerald-950/60'
                    : 'text-amber-400 bg-amber-950/60'
                }`}
              >
                {node.status}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
