import React, { useMemo, useState } from 'react';
import type { InfrastructureDataset } from '../types/infrastructure';
import { findWeakPoints } from '../utils/analysis';
import { getSectorConfig } from '../utils/sectorConfig';
import {
  ShieldAlert,
  X,
  AlertTriangle,
  Play,
  Crosshair,
  Search,
  CheckCircle2,
} from 'lucide-react';

interface WeakPointModalProps {
  dataset: InfrastructureDataset;
  isOpen: boolean;
  onClose: () => void;
  onSelectAndSimulate: (assetId: string) => void;
  onFocusAsset: (assetId: string) => void;
}

export const WeakPointModal: React.FC<WeakPointModalProps> = ({
  dataset,
  isOpen,
  onClose,
  onSelectAndSimulate,
  onFocusAsset,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [showAllRisks, setShowAllRisks] = useState<boolean>(false);

  const weakPoints = useMemo(() => {
    return findWeakPoints(dataset);
  }, [dataset]);

  const topWeakPoint = weakPoints.length > 0 ? weakPoints[0] : null;

  const filteredWeakPoints = useMemo(() => {
    return weakPoints.filter((wp) => {
      const matchesSearch =
        wp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        wp.assetId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSector = sectorFilter === 'all' || wp.sector === sectorFilter;
      return matchesSearch && matchesSector;
    });
  }, [weakPoints, searchQuery, sectorFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-900/90 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white tracking-tight flex items-center gap-2">
                <span>FIND THE BIGGEST RISK</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Which service would cause the most impact if it failed?
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

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Hero Section: BIGGEST RISK FOUND */}
          {topWeakPoint ? (
            <div className="p-5 rounded-2xl bg-gradient-to-br from-red-950/60 via-slate-900 to-slate-900 border-2 border-red-600/80 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-black uppercase tracking-wider">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  ⚠ BIGGEST RISK FOUND
                </span>
                <span className="text-xs text-slate-400 font-mono">Rank #1</span>
              </div>

              <h3 className="text-2xl font-black text-white tracking-tight mb-1">
                {topWeakPoint.name}
              </h3>
              <p className="text-sm text-slate-300 mb-4">
                If this fails, it can affect the largest part of this city network.
              </p>

              {/* Calculated Facts */}
              <div className="grid grid-cols-3 gap-3 mb-5 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center">
                <div>
                  <div className="text-2xl font-black text-red-400 font-mono">
                    {topWeakPoint.totalCascadeAffected}
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium">services affected</div>
                </div>
                <div className="border-x border-slate-800">
                  <div className="text-2xl font-black text-cyan-300 font-mono">
                    {topWeakPoint.sectorsReachedCount}
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium">sectors reached</div>
                </div>
                <div>
                  <div className="text-2xl font-black text-amber-300 font-mono">
                    {topWeakPoint.maxSteps}
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium">cascade steps</div>
                </div>
              </div>

              {/* Action Button: TEST THIS FAILURE */}
              <button
                onClick={() => {
                  onSelectAndSimulate(topWeakPoint.assetId);
                  onClose();
                }}
                className="w-full py-3.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-sm shadow-lg shadow-red-950/80 hover:shadow-red-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer mb-4"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>② TEST THIS FAILURE</span>
              </button>

              {/* Why is this risky? */}
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
                <div className="font-bold text-slate-300 mb-0.5">Why is this risky?</div>
                <p className="text-slate-400 leading-relaxed">
                  Many city services depend directly or indirectly on this {topWeakPoint.name.toLowerCase()}. When it goes offline, connected systems lose power or support in sequence.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs">
              No weak points calculated. Check that assets and dependencies exist.
            </div>
          )}

          {/* Toggle for Technical Details / All Rankings */}
          <div className="pt-1">
            <button
              onClick={() => setShowAllRisks(!showAllRisks)}
              className="w-full py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-between cursor-pointer font-medium"
            >
              <span>{showAllRisks ? '▲ Hide Full Rankings' : '▼ Technical Details & All Risk Rankings'}</span>
              <span className="text-[11px] text-slate-500">
                {weakPoints.length} total services analyzed
              </span>
            </button>
          </div>

          {/* Expandable Technical Details & All Risks */}
          {showAllRisks && (
            <div className="space-y-4 pt-2 border-t border-slate-800">
              {/* Filter Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search services..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex items-center gap-1 overflow-x-auto text-xs">
                  <button
                    onClick={() => setSectorFilter('all')}
                    className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                      sectorFilter === 'all'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All Sectors
                  </button>
                  {dataset.sectors.map((sec) => (
                    <button
                      key={sec}
                      onClick={() => setSectorFilter(sec)}
                      className={`px-2 py-1 rounded-md font-medium cursor-pointer transition-colors whitespace-nowrap ${
                        sectorFilter === sec
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {sec}
                    </button>
                  ))}
                </div>
              </div>

              {/* Weak Points Ranked List */}
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
          {filteredWeakPoints.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              No weak points found matching the selected filter.
            </div>
          ) : (
            filteredWeakPoints.map((wp) => {
              const cfg = getSectorConfig(wp.sector);
              const SectorIcon = cfg.icon;

              const isCritical = wp.criticality === 'Critical';
              const isHigh = wp.criticality === 'High';

              return (
                <div
                  key={wp.assetId}
                  className={`p-4 rounded-xl border transition-all ${
                    isCritical
                      ? 'bg-slate-900/90 border-red-800/80 hover:border-red-600 ring-1 ring-red-500/10'
                      : isHigh
                      ? 'bg-slate-900/70 border-amber-800/60 hover:border-amber-600'
                      : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left: Rank & Asset Info */}
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                          wp.rank === 1
                            ? 'bg-red-500 text-slate-950 shadow-md shadow-red-500/30'
                            : wp.rank <= 3
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        #{wp.rank}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white leading-snug">
                            {wp.name}
                          </h4>
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded border ${cfg.color}`}
                          >
                            <SectorIcon className="w-3 h-3" />
                            <span>{wp.sector}</span>
                          </span>

                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                              isCritical
                                ? 'bg-red-950 text-red-300 border border-red-800/60'
                                : isHigh
                                ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {wp.criticality} Risk
                          </span>
                        </div>

                        {/* Impact Summary Sentence in Simple English */}
                        <p className="text-xs text-slate-300 mt-1">
                          Failing this asset affects{' '}
                          <strong className="text-amber-400 font-mono">
                            {wp.totalCascadeAffected}
                          </strong>{' '}
                          facilities across{' '}
                          <strong className="text-cyan-400 font-mono">
                            {wp.sectorsReachedCount}
                          </strong>{' '}
                          sectors.
                        </p>

                        {/* Badges / Metrics */}
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-400">
                          <span>
                            Direct dependents:{' '}
                            <strong className="text-slate-200 font-mono">
                              {wp.directDependentsCount}
                            </strong>
                          </span>
                          <span className="text-slate-700">·</span>
                          <span>
                            Max propagation depth:{' '}
                            <strong className="text-slate-200 font-mono">
                              {wp.maxSteps} steps
                            </strong>
                          </span>
                          {wp.criticalServicesImpacted > 0 && (
                            <>
                              <span className="text-slate-700">·</span>
                              <span className="text-red-400 font-medium flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {wp.criticalServicesImpacted} critical health/emergency services
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        onClick={() => {
                          onFocusAsset(wp.assetId);
                          onClose();
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                        title="Focus on Graph"
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                        <span>Inspect</span>
                      </button>

                      <button
                        onClick={() => {
                          onSelectAndSimulate(wp.assetId);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-md shadow-red-950 flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Test Failure</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Analysis calculated dynamically from current graph topology</span>
          </div>

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
