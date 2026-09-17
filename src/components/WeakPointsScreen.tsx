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
    <div className="w-full h-full flex flex-col bg-[#061019] text-[#f2f4f0] overflow-hidden select-none">
      {/* Header */}
      <div className="h-14 px-6 border-b border-[#182c3f] bg-[#071321]/90 flex items-center justify-between shrink-0 z-10 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-1.5 text-[9px] font-medium tracking-[0.2em] text-[#b9cecf] uppercase">
            <span className="w-3 h-px bg-[#addcd7]" />
            <span>Vulnerability Analysis</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xs font-semibold text-[#f2f4f0] uppercase tracking-wider">
              Systemic Weak Points
            </h1>
            <span className="text-[10px] text-[#8096a4]">
              Ranked infrastructure bottlenecks causing widest downstream cascades
            </span>
          </div>
        </div>

        <div className="text-[11px] text-[#8096a4] hidden sm:block">
          {weakPoints.length} Critical Bottlenecks Ranked
        </div>
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto p-6 max-w-4xl w-full mx-auto space-y-3">
        {weakPoints.map((wp) => {
          const isWhyOpen = openWhyId === wp.assetId;
          const sectorCfg = getSectorConfig(wp.sector);

          return (
            <div
              key={wp.assetId}
              className={`p-4.5 rounded-xl border transition-all ${
                wp.rank === 1
                  ? 'bg-[#140a0e]/40 border-red-500/40 shadow-sm'
                  : 'bg-[#0a1726]/80 border-[#182c3f] hover:border-[#84979a40]'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Left: Rank & Title */}
                <div className="flex items-start sm:items-center gap-3">
                  <span
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold font-mono shrink-0 ${
                      wp.rank === 1
                        ? 'bg-red-500 text-white shadow-sm'
                        : wp.rank <= 3
                        ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300'
                        : 'bg-[#071321] border border-[#182c3f] text-[#8096a4]'
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
                      <span className="text-[10px] font-semibold text-[#8096a4] uppercase tracking-wider">
                        {wp.sector}
                      </span>
                    </div>
                    <h2 className="text-sm sm:text-base font-semibold text-[#f2f4f0]">
                      {wp.name}
                    </h2>
                  </div>
                </div>

                {/* Right: Impact count & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0">
                  <div className="text-right">
                    <div className="text-lg sm:text-xl font-bold text-red-400 font-mono">
                      {wp.totalCascadeAffected}
                    </div>
                    <div className="text-[10px] text-[#8096a4] font-medium">
                      services affected
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setOpenWhyId(isWhyOpen ? null : wp.assetId)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                        isWhyOpen
                          ? 'bg-[#0d2236] border border-[#a8e2dc] text-[#a8e2dc]'
                          : 'bg-[#071321] hover:bg-[#0d1e30] border border-[#84979a40] text-[#c0d0dc]'
                      }`}
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>WHY?</span>
                    </button>

                    <button
                      onClick={() => onSelectForFailureTest(wp.assetId)}
                      className="px-3.5 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-semibold uppercase tracking-wider shadow-sm flex items-center gap-1.5 cursor-pointer transition-all active:scale-98"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>TEST FAILURE</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Short Calculated Reason dropdown */}
              {isWhyOpen && (
                <div className="mt-3.5 pt-3 border-t border-[#182c3f] text-xs text-[#a9b9c3] bg-[#061019] p-3 rounded-lg border border-[#182c3f] animate-in fade-in zoom-in-95 duration-150 flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#a8e2dc] shrink-0 mt-1.5" />
                  <p className="leading-relaxed">
                    <strong className="text-[#a8e2dc]">Analysis:</strong> {getCalculatedReason(wp)}
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
