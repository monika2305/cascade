import React, { useState, useMemo } from 'react';
import type { InfrastructureDataset } from '../types/infrastructure';
import { runIntervention, type InterventionAction, type InterventionResult, type InterventionType } from '../utils/analysis';
import { getSectorConfig } from '../utils/sectorConfig';
import {
  FlaskConical,
  X,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface ActionLabModalProps {
  dataset: InfrastructureDataset;
  currentFailureId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onApplyIntervention: (result: InterventionResult) => void;
}

export const ActionLabModal: React.FC<ActionLabModalProps> = ({
  dataset,
  currentFailureId,
  isOpen,
  onClose,
  onApplyIntervention,
}) => {
  // Scenario initial failure
  const [failureId, setFailureId] = useState<string>(
    currentFailureId || (dataset.assets.length > 0 ? dataset.assets[0].id : '')
  );

  // Intervention type selection
  const [actionType, setActionType] = useState<InterventionType>('protect_asset');

  // Parameters for each intervention type
  const [protectAssetId, setProtectAssetId] = useState<string>('');
  const [severEdgeKey, setSeverEdgeKey] = useState<string>('');
  const [redundantSource, setRedundantSource] = useState<string>('');
  const [redundantTarget, setRedundantTarget] = useState<string>('');

  // Result state
  const [comparisonResult, setComparisonResult] = useState<InterventionResult | null>(null);

  // Default selections based on dataset
  const criticalAssets = useMemo(() => {
    return dataset.assets.filter(
      (a) => a.sector === 'Health' || a.sector === 'Emergency Services' || a.sector === 'Water'
    );
  }, [dataset.assets]);

  // Available connections that can be severed
  const availableEdges = useMemo(() => {
    return dataset.dependencies;
  }, [dataset.dependencies]);

  if (!isOpen) return null;

  const handleSimulate = (e: React.FormEvent) => {
    e.preventDefault();

    let action: InterventionAction;

    if (actionType === 'protect_asset') {
      const targetId = protectAssetId || (criticalAssets.length > 0 ? criticalAssets[0].id : dataset.assets[0].id);
      const targetAsset = dataset.assets.find((a) => a.id === targetId);
      action = {
        type: 'protect_asset',
        name: `Protect ${targetAsset?.name || targetId} with Local Backup`,
        assetId: targetId,
      };
    } else if (actionType === 'isolate_connection') {
      const selectedDep = availableEdges.find(
        (d) => `${d.source}->${d.target}` === severEdgeKey
      ) || availableEdges[0];

      if (!selectedDep) return;

      action = {
        type: 'isolate_connection',
        name: `Sever connection ${selectedDep.source} → ${selectedDep.target}`,
        sourceAssetId: selectedDep.source,
        targetAssetId: selectedDep.target,
      };
    } else {
      // Add redundant connection
      const src = redundantSource || dataset.assets[0].id;
      const tgt = redundantTarget || (dataset.assets[1] ? dataset.assets[1].id : dataset.assets[0].id);
      action = {
        type: 'add_connection',
        name: `Add redundant feed from ${src} to ${tgt}`,
        sourceAssetId: src,
        targetAssetId: tgt,
      };
    }

    const result = runIntervention(dataset, failureId, action);
    setComparisonResult(result);
  };

  const handleApplyToGraph = () => {
    if (!comparisonResult) return;
    onApplyIntervention(comparisonResult);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-900/90 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <FlaskConical className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white tracking-tight flex items-center gap-2">
                <span>TRY A FIX</span>
                <span className="text-[10px] font-bold tracking-wide uppercase bg-cyan-950 text-cyan-300 border border-cyan-800/80 px-2 py-0.5 rounded">
                  STEP ④
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Choose an action and see whether it reduces the impact.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <form onSubmit={handleSimulate} className="space-y-4">
            {/* 1. What Failed? */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                What Failed?
              </label>
              <select
                value={failureId}
                onChange={(e) => {
                  setFailureId(e.target.value);
                  setComparisonResult(null);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500 font-medium"
              >
                {dataset.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.sector})
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Choose a Fix */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Choose a Fix
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setActionType('protect_asset');
                    setComparisonResult(null);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    actionType === 'protect_asset'
                      ? 'bg-cyan-950/50 border-cyan-400 ring-1 ring-cyan-400/40 text-white'
                      : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="font-extrabold text-xs mb-1 flex items-center gap-1.5">
                    <span>🛡 Protect a Service</span>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-snug">
                    Keep one important service working.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActionType('isolate_connection');
                    setComparisonResult(null);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    actionType === 'isolate_connection'
                      ? 'bg-cyan-950/50 border-cyan-400 ring-1 ring-cyan-400/40 text-white'
                      : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="font-extrabold text-xs mb-1 flex items-center gap-1.5">
                    <span>✂ Stop a Connection</span>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-snug">
                    Prevent the failure from spreading through one connection.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActionType('add_connection');
                    setComparisonResult(null);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    actionType === 'add_connection'
                      ? 'bg-cyan-950/50 border-cyan-400 ring-1 ring-cyan-400/40 text-white'
                      : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="font-extrabold text-xs mb-1 flex items-center gap-1.5">
                    <span>🔗 Add Backup Connection</span>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-snug">
                    Give a service another source.
                  </div>
                </button>
              </div>
            </div>

            {/* 3. Action Selection Details */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-3">
              {actionType === 'protect_asset' && (
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    Choose a service you want to keep working:
                  </label>
                  <select
                    value={protectAssetId}
                    onChange={(e) => {
                      setProtectAssetId(e.target.value);
                      setComparisonResult(null);
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">-- Choose Service --</option>
                    {dataset.assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.sector})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {actionType === 'isolate_connection' && (
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    Choose a connection to stop:
                  </label>
                  <select
                    value={severEdgeKey}
                    onChange={(e) => {
                      setSeverEdgeKey(e.target.value);
                      setComparisonResult(null);
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">-- Choose Connection --</option>
                    {availableEdges.map((d, i) => {
                      const src = dataset.assets.find((a) => a.id === d.source);
                      const tgt = dataset.assets.find((a) => a.id === d.target);
                      return (
                        <option key={i} value={`${d.source}->${d.target}`}>
                          {src?.name || d.source} → {tgt?.name || d.target}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {actionType === 'add_connection' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1.5">
                      Backup Source:
                    </label>
                    <select
                      value={redundantSource}
                      onChange={(e) => {
                        setRedundantSource(e.target.value);
                        setComparisonResult(null);
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="">-- Select Source --</option>
                      {dataset.assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.sector})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1.5">
                      Service to Connect:
                    </label>
                    <select
                      value={redundantTarget}
                      onChange={(e) => {
                        setRedundantTarget(e.target.value);
                        setComparisonResult(null);
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="">-- Select Service --</option>
                      {dataset.assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.sector})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs tracking-wider uppercase transition-all shadow-md shadow-cyan-950 cursor-pointer flex items-center justify-center gap-2"
            >
              <FlaskConical className="w-4 h-4" />
              <span>TEST THIS FIX</span>
            </button>
          </form>

          {/* Visual Comparison Result Card */}
          {comparisonResult && (
            <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-700 shadow-xl space-y-4 animate-fade-in">
              {/* Verdict Header */}
              {comparisonResult.savedAssetsCount > 0 ? (
                <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <div className="text-xs font-black text-emerald-300 uppercase tracking-wider">
                        ✓ THIS FIX HELPS
                      </div>
                      <div className="text-xs text-slate-300">
                        Impact reduced from {comparisonResult.beforeAffectedCount} to {comparisonResult.afterAffectedCount} affected services.
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full border-2 border-slate-500 flex items-center justify-center text-slate-400 text-xs font-bold">
                      ○
                    </div>
                    <div>
                      <div className="text-xs font-black text-slate-300 uppercase tracking-wider">
                        ○ NO IMPROVEMENT
                      </div>
                      <div className="text-xs text-slate-400">
                        THIS FIX DID NOT REDUCE THE CASCADE. Try a different service or action.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Visual Bar Comparison */}
              <div className="space-y-3 p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                {/* Without Fix */}
                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span className="font-bold text-red-400 uppercase">Without Fix</span>
                    <span className="font-mono font-bold text-white">{comparisonResult.beforeAffectedCount} affected</span>
                  </div>
                  <div className="w-full h-4 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(12, (comparisonResult.beforeAffectedCount / (dataset.assets.length || 1)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Arrow down difference */}
                {comparisonResult.savedAssetsCount > 0 && (
                  <div className="flex items-center justify-center gap-1.5 py-1 text-emerald-400 text-xs font-bold">
                    <ArrowRight className="w-3.5 h-3.5 rotate-90" />
                    <span>{comparisonResult.savedAssetsCount} fewer services affected</span>
                  </div>
                )}

                {/* With Fix */}
                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span className="font-bold text-emerald-400 uppercase">With Fix</span>
                    <span className="font-mono font-bold text-white">{comparisonResult.afterAffectedCount} affected</span>
                  </div>
                  <div className="w-full h-4 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        comparisonResult.savedAssetsCount > 0 ? 'bg-emerald-400' : 'bg-slate-500'
                      }`}
                      style={{
                        width: `${Math.min(100, Math.max(12, (comparisonResult.afterAffectedCount / (dataset.assets.length || 1)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Saved Facilities List */}
              {comparisonResult.savedAssetsCount > 0 && (
                <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40 text-xs">
                  <div className="font-bold text-emerald-300 flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Saved from disruption:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {comparisonResult.savedAssetIds.map((id) => {
                      const a = dataset.assets.find((item) => item.id === id);
                      const cfg = getSectorConfig(a?.sector || 'Other');
                      const Icon = cfg.icon;

                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-700/60 text-emerald-200 text-[11px]"
                        >
                          <Icon className="w-3 h-3 text-emerald-400" />
                          <span>{a?.name || id}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Primary Action Button */}
              {comparisonResult.savedAssetsCount > 0 ? (
                <button
                  onClick={handleApplyToGraph}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-xs tracking-wider uppercase transition-all shadow-md shadow-emerald-950 cursor-pointer flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>SEE THE IMPROVED NETWORK</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setComparisonResult(null)}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs tracking-wider uppercase transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>TRY ANOTHER FIX</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400">
          <span>Both results calculated from actual network dependencies</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
