import React from 'react';
import type { InfrastructureDataset, UserRole } from '../types/infrastructure';
import { SectorBadge } from './SectorBadge';
import { ROLES } from '../types/roles';
import { ArrowLeft, GitFork, CheckCircle2, Shield } from 'lucide-react';

interface NetworkViewPlaceholderProps {
  dataset: InfrastructureDataset;
  role: UserRole;
  onBackToPreview: () => void;
  onResetAll: () => void;
}

export const NetworkViewPlaceholder: React.FC<NetworkViewPlaceholderProps> = ({
  dataset,
  role,
  onBackToPreview,
  onResetAll,
}) => {
  const currentRole = ROLES.find((r) => r.id === role) || ROLES[0];

  // Role prioritization: filter assets in primary sectors of the role
  const priorityAssets = dataset.assets.filter((a) =>
    currentRole.primarySectors.includes(a.sector)
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Navigation and Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-800">
        <div>
          <button
            onClick={onBackToPreview}
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Data Preview</span>
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Network Overview
            </h2>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-cyan-950/80 border border-cyan-800/60 text-cyan-400 flex items-center gap-1.5">
              <span>{currentRole.icon}</span>
              <span>{currentRole.name} Lens</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onResetAll}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
          >
            Start Over
          </button>
        </div>
      </div>

      {/* Notice Banner explaining Phase 1 boundary */}
      <div className="mb-8 p-4 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-cyan-200 flex items-start gap-3">
        <GitFork className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="text-sm">
          <span className="font-semibold text-cyan-300">Phase 1 Foundation Complete: </span>
          Data ingested and normalized successfully across {dataset.summary.assetCount} assets and {dataset.summary.dependencyCount} connections. Ready for Phase 2 failure injection and cascade propagation.
        </div>
      </div>

      {/* Role Lens Summary */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            {currentRole.name} Focus
          </h3>
        </div>
        <p className="text-slate-400 text-xs sm:text-sm mb-4">
          {currentRole.focusDescription}
        </p>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Priority Sectors:</span>
          <div className="flex flex-wrap gap-1.5">
            {currentRole.primarySectors.map((sec) => (
              <span key={sec} className="text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/50">
                {sec}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Connected Assets Inventory Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Assets Registered ({dataset.assets.length})
          </h3>
          <span className="text-xs text-slate-400">
            {priorityAssets.length} prioritized under {currentRole.name}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {dataset.assets.map((asset) => {
            const isPriority = currentRole.primarySectors.includes(asset.sector);
            return (
              <div
                key={asset.id}
                className={`p-4 rounded-xl border transition-all ${
                  isPriority
                    ? 'bg-slate-900/90 border-slate-700 shadow-md ring-1 ring-cyan-500/20'
                    : 'bg-slate-900/40 border-slate-800/80 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="font-semibold text-white text-sm line-clamp-1">{asset.name}</span>
                  <SectorBadge sector={asset.sector} size="sm" />
                </div>
                <div className="text-xs text-slate-400 font-mono mb-2">{asset.id}</div>
                <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/60">
                  <span>Type: {asset.type}</span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{asset.status}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
