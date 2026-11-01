'use client';

import React, { useState } from 'react';
import {
  Search,
  Send,
  Zap,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Terminal,
  Cpu,
  Layers,
} from 'lucide-react';

interface KeySimulatorProps {
  onExecute: (
    method: 'GET' | 'POST' | 'DELETE',
    key: string,
    value?: unknown,
    ttlMs?: number
  ) => Promise<any>;
}

export function KeySimulator({ onExecute }: KeySimulatorProps) {
  const [method, setMethod] = useState<'GET' | 'POST' | 'DELETE'>('GET');
  const [keyInput, setKeyInput] = useState('user:1001');
  const [valInput, setValInput] = useState('{"name": "Alice Cooper", "role": "admin"}');
  const [ttlInput, setTtlInput] = useState('300000'); // 5 minutes
  const [isLoading, setIsLoading] = useState(false);
  const [lastTrace, setLastTrace] = useState<any | null>(null);

  const presets = [
    { key: 'user:1001', method: 'GET', desc: 'User profile query' },
    { key: 'session:tok_991a', method: 'GET', desc: 'Auth token lookup' },
    { key: 'product:sku_410', method: 'POST', val: '{"stock": 142, "price": 299.99}', desc: 'Update inventory' },
    { key: 'cache:geo:us_east', method: 'GET', desc: 'Geodata cache' },
    { key: 'rate_limit:ip_192_168', method: 'POST', val: '{"tokens": 49}', ttl: '60000', desc: 'Rate limit bucket' },
  ];

  const handleRun = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!keyInput.trim()) return;

    setIsLoading(true);
    try {
      let parsedVal: unknown = valInput;
      if (method === 'POST') {
        try {
          parsedVal = JSON.parse(valInput);
        } catch {
          parsedVal = valInput;
        }
      }

      const parsedTtl = ttlInput ? Number(ttlInput) : undefined;
      const res = await onExecute(method, keyInput.trim(), parsedVal, parsedTtl);
      setLastTrace({
        timestamp: Date.now(),
        method,
        key: keyInput.trim(),
        ...res,
      });
    } catch (err: any) {
      setLastTrace({
        timestamp: Date.now(),
        method,
        key: keyInput.trim(),
        error: err?.message || 'Execution error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-6 border border-slate-800 shadow-2xl flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Live Key Router & Shard Engine
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-950 text-violet-300 font-mono border border-violet-800/60">
                O(1) Engine + O(log N) Bisect
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Interactive cache read, write, and invalidation with MurmurHash3 tracing
            </p>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-slate-500 font-mono">Presets:</span>
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                setKeyInput(p.key);
                setMethod(p.method as any);
                if (p.val) setValInput(p.val);
                if (p.ttl) setTtlInput(p.ttl);
              }}
              className="text-[11px] px-2 py-1 rounded bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 font-mono transition-colors"
            >
              {p.key}
            </button>
          ))}
        </div>
      </div>

      {/* Execution Form */}
      <form onSubmit={handleRun} className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Method selector */}
          <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800 shrink-0">
            {(['GET', 'POST', 'DELETE'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all ${
                  method === m
                    ? m === 'GET'
                      ? 'bg-cyan-500 text-slate-950 shadow'
                      : m === 'POST'
                      ? 'bg-emerald-500 text-slate-950 shadow'
                      : 'bg-rose-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Key Input */}
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs">
              KEY:
            </span>
            <input
              type="text"
              required
              placeholder="e.g. user:1001 or session:tok_991a"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="w-full pl-12 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* TTL Input */}
          {method === 'POST' && (
            <div className="relative w-full sm:w-36">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs">
                TTL:
              </span>
              <input
                type="number"
                placeholder="ms (e.g. 60000)"
                value={ttlInput}
                onChange={(e) => setTtlInput(e.target.value)}
                className="w-full pl-12 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
          )}

          {/* Execute Button */}
          <button
            type="submit"
            disabled={isLoading || !keyInput.trim()}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0"
          >
            {isLoading ? (
              <span className="animate-spin">⏳</span>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Route & Execute
              </>
            )}
          </button>
        </div>

        {/* Value JSON Input (only for POST) */}
        {method === 'POST' && (
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">
              PAYLOAD (JSON or String):
            </label>
            <textarea
              rows={2}
              value={valInput}
              onChange={(e) => setValInput(e.target.value)}
              placeholder='{"data": "example payload"}'
              className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 resize-none"
            />
          </div>
        )}
      </form>

      {/* Algorithmic Execution Trace Panel */}
      {lastTrace && (
        <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 font-mono text-xs animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80 mb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-slate-200">
                Execution Trace & Routing Calculus
              </span>
            </div>
            <span className="text-[10px] text-slate-500">
              {new Date(lastTrace.timestamp).toLocaleTimeString()}
            </span>
          </div>

          {lastTrace.error ? (
            <div className="flex items-center gap-2 text-rose-400 bg-rose-950/40 p-2.5 rounded-lg border border-rose-900/60">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{lastTrace.error}</span>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Step-by-step pipeline */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                {/* 1. Hash computation */}
                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400 mb-0.5">1. MurmurHash3 (32-bit)</div>
                  <div className="text-cyan-300 font-bold">
                    {lastTrace.routing?.hashHex || '0x--------'}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {lastTrace.routing?.hash?.toLocaleString()}
                  </div>
                </div>

                {/* 2. Ring Coordinates */}
                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400 mb-0.5">2. Circular Angle</div>
                  <div className="text-amber-300 font-bold">
                    {lastTrace.routing?.angleDeg}°
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Clockwise Ring Position
                  </div>
                </div>

                {/* 3. Binary Search Bisect */}
                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400 mb-0.5">3. Bisect Search</div>
                  <div className="text-violet-300 font-bold">
                    {lastTrace.routing?.binarySearchSteps} Steps
                  </div>
                  <div className="text-[10px] text-slate-500">
                    O(log N) Upper-Bound
                  </div>
                </div>

                {/* 4. Target Shard Routing */}
                <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400 mb-0.5">4. Target Shard</div>
                  <div className="flex items-center gap-1.5 font-bold text-slate-100">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor: lastTrace.routing?.targetNode?.color || '#10b981',
                      }}
                    />
                    {lastTrace.routing?.targetNode?.name}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    VNode: {lastTrace.routing?.targetVNode?.vnodeId}
                  </div>
                </div>
              </div>

              {/* Shard Engine Result */}
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {lastTrace.method === 'GET' ? (
                    lastTrace.hit ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-amber-400" />
                    )
                  ) : (
                    <CheckCircle className="w-4 h-4 text-cyan-400" />
                  )}

                  <div>
                    <span className="font-bold text-slate-200">
                      {lastTrace.method === 'GET'
                        ? lastTrace.hit
                          ? 'CACHE HIT'
                          : 'CACHE MISS'
                        : lastTrace.method === 'POST'
                        ? 'CACHE WRITTEN'
                        : 'KEY INVALIDATED'}
                    </span>
                    <span className="text-slate-400 ml-2">
                      Latency: <span className="text-cyan-300">{lastTrace.latencyUs}µs</span>
                      {lastTrace.accessCount !== undefined && (
                        <span> • Access Count: {lastTrace.accessCount}</span>
                      )}
                    </span>
                  </div>
                </div>

                {lastTrace.expiresAt && (
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    Expires: {new Date(lastTrace.expiresAt).toLocaleTimeString()}
                  </div>
                )}
              </div>

              {/* Cached Value Preview */}
              {lastTrace.value !== undefined && lastTrace.value !== null && (
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-900 overflow-x-auto text-[11px] text-slate-300">
                  <span className="text-slate-500">PAYLOAD: </span>
                  {typeof lastTrace.value === 'object'
                    ? JSON.stringify(lastTrace.value)
                    : String(lastTrace.value)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
