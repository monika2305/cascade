import React, { useState, useMemo } from 'react';
import type { InfrastructureDataset } from '../types/infrastructure';
import { findWeakPoints, type WeakPoint } from '../utils/analysis';
import { getSectorConfig } from '../utils/sectorConfig';
import { Zap, HelpCircle } from 'lucide-react';

interface WeakPointsScreenProps {
  dataset: InfrastructureDataset;
  onSelectForFailureTest: (assetId: string) => void;
}

export const WeakPointsScreen: React.FC<WeakPointsScreenProps> = ({
  dataset,
  onSelectForFailureTest,
}) => {
  const [openWhyId, setOpenWhyId] = useState<string | null>(null);

  // Deterministic calculation from existing engine
  const weakPoints: WeakPoint[] = useMemo(() => {
    return findWeakPoints(dataset);
  }, [dataset]);

  const getCalculatedReason = (wp: WeakPoint) => {
    const directCount = wp.directDependentsCount;
    const sectors = wp.sectorsReachedCount;
    const steps = wp.maxSteps;
    const critical = wp.criticalServicesImpacted;

    if (critical > 0) {
      return `Directly powers ${directCount} services across ${sectors} sectors. Failure cascades ${steps} steps deep and compromises ${critical} critical health/emergency facilities.`;
    }
    return `Critical upstream provider with ${directCount} direct connections. When down, ${sectors} sectors lose supply within ${steps} cascade steps.`;
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-800/80 bg-slate-950/90 shrink-0">
        <h1 className="text-xl font-black text-white tracking-wide uppercase">
          WEAK POINTS
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          These services could cause the biggest impact if they fail.
        </p>
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto p-6 max-w-4xl w-full mx-auto space-y-3">
        {weakPoints.map((wp) => {
          const isWhyOpen = openWhyId === wp.assetId;
          const sectorCfg = getSectorConfig(wp.sector);

          return (
            <div
              key={wp.assetId}
              className={`p-5 rounded-2xl border transition-all ${
                wp.rank === 1
                  ? 'bg-red-950/20 border-red-500/50 shadow-lg shadow-red-950/20'
                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Left: Rank & Title */}
                <div className="flex items-start sm:items-center gap-3">
                  <span
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black font-mono shrink-0 ${
                      wp.rank === 1
                        ? 'bg-red-500 text-white shadow-md shadow-red-500/40'
                        : wp.rank <= 3
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    #{wp.rank}
                  </span>

                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: sectorCfg.color }}
                      />
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        {wp.sector}
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-black text-white">
                      {wp.name}
                    </h2>
                  </div>
                </div>

                {/* Right: Impact count & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                  <div className="text-right">
                    <div className="text-xl sm:text-2xl font-black text-red-400 font-mono">
                      {wp.totalCascadeAffected}
                    </div>
                    <div className="text-[11px] text-slate-400 font-medium">
                      services could be affected
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setOpenWhyId(isWhyOpen ? null : wp.assetId)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        isWhyOpen
                          ? 'bg-cyan-500 text-slate-950'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>WHY?</span>
                    </button>

                    <button
                      onClick={() => onSelectForFailureTest(wp.assetId)}
                      className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider shadow-md shadow-red-950/40 flex items-center gap-1.5 cursor-pointer transition-all active:scale-98"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>TEST FAILURE</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Short Calculated Reason dropdown */}
              {isWhyOpen && (
                <div className="mt-4 pt-3.5 border-t border-slate-800 text-xs text-slate-300 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 animate-fade-in flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 mt-1.5" />
                  <p className="leading-relaxed">
                    <strong className="text-cyan-300">Analysis:</strong> {getCalculatedReason(wp)}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
