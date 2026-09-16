import React from 'react';
import type { InfrastructureDataset, UserRole } from '../types/infrastructure';
import { SectorBadge } from './SectorBadge';
import { CheckCircle2, ArrowRight, RotateCcw, Building2, Network, Layers, Sparkles } from 'lucide-react';
import { ROLES } from '../types/roles';

interface DataPreviewScreenProps {
  dataset: InfrastructureDataset;
  role: UserRole;
  onViewNetwork: () => void;
  onResetData: () => void;
}

export const DataPreviewScreen: React.FC<DataPreviewScreenProps> = ({
  dataset,
  role,
  onViewNetwork,
  onResetData,
}) => {
  const currentRole = ROLES.find((r) => r.id === role) || ROLES[0];
  const { summary } = dataset;
  const isSample = dataset.isSample ?? false;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Top Success Banner & Source Indicator */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold tracking-wide">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Data Ready ✓</span>
          </div>

          {isSample ? (
            <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-800/60 text-amber-300 text-xs font-bold tracking-wide">
              <Sparkles className="w-3 h-3" />
              <span>Sample Data</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 text-xs font-bold tracking-wide">
              <span>Your Data</span>
            </div>
          )}
        </div>

        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          {dataset.name}
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Perspective: <span className="text-cyan-400 font-medium">{currentRole.name}</span> {currentRole.icon}
        </p>
      </div>

      {/* Dynamic Counts - Derived Strictly from Uploaded File */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {/* Assets Found */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {summary.assetCount}
            </div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mt-0.5">
              Assets Found
            </div>
          </div>
        </div>

        {/* Connections Found */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0">
            <Network className="w-6 h-6" />
          </div>
          <div>
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {summary.dependencyCount}
            </div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mt-0.5">
              Connections Found
            </div>
          </div>
        </div>

        {/* Sectors Found */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {summary.sectorCount}
            </div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mt-0.5">
              Sectors Found
            </div>
          </div>
        </div>
      </div>

      {/* Sector Breakdown Pills */}
      <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 mb-8">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">
          Sectors in City
        </h3>
        <div className="flex flex-wrap gap-2.5">
          {dataset.sectors.map((sector) => {
            const count = summary.sectorCounts[sector];
            return (
              <SectorBadge
                key={sector}
                sector={sector}
                count={count}
                size="md"
              />
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <button
          onClick={onResetData}
          className="w-full sm:w-auto px-5 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Change File</span>
        </button>

        <button
          onClick={onViewNetwork}
          className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-bold text-base shadow-lg shadow-cyan-500/20 hover:shadow-cyan-400/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>View Network</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
