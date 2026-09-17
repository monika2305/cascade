import React, { useState, useRef } from 'react';
import type { InfrastructureDataset, ParseResult } from '../types/infrastructure';
import { parseInfrastructureFile, buildDataset } from '../utils/parser';
import sampleCascadeCity from '../data/sample_cascade_city.json';
import { UploadCloud, CheckCircle2, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';

interface UploadScreenProps {
  userName: string;
  dataset: InfrastructureDataset | null;
  onDatasetLoaded: (dataset: InfrastructureDataset) => void;
  onViewNetwork: () => void;
}

export const UploadScreen: React.FC<UploadScreenProps> = ({
  userName,
  dataset,
  onDatasetLoaded,
  onViewNetwork,
}) => {
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const processFile = (file: File) => {
    setErrorMessages([]);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        const result: ParseResult = parseInfrastructureFile(file.name, content);
        if (result.success && result.dataset) {
          onDatasetLoaded(result.dataset);
        } else {
          setErrorMessages(result.errors || ['Could not read infrastructure data from this file.']);
        }
      } catch {
        setErrorMessages(['An error occurred while reading the file. Please check its contents.']);
      }
    };
    reader.readAsText(file);
  };

  const handleLoadSample = () => {
    setErrorMessages([]);
    try {
      const parsed = parseInfrastructureFile('sample_cascade_city.json', JSON.stringify(sampleCascadeCity));
      if (parsed.success && parsed.dataset) {
        onDatasetLoaded(parsed.dataset);
        return;
      }
    } catch {
      // Fallback to buildDataset below
    }
    const built = buildDataset(
      sampleCascadeCity.name || 'CASCADE Demo City',
      sampleCascadeCity.assets as any,
      sampleCascadeCity.dependencies as any
    );
    onDatasetLoaded(built);
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-[#061019] text-[#f2f4f0] overflow-y-auto select-none">
      <div className="w-full max-w-xl text-center">
        {/* Eyebrow & Welcome greeting */}
        <div className="flex items-center justify-center gap-2 text-[10px] font-medium tracking-[0.2em] text-[#b9cecf] uppercase mb-2">
          <span className="w-4 h-px bg-[#addcd7]" />
          <span>System Onboarding</span>
          <span className="w-4 h-px bg-[#addcd7]" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-light text-[#f2f4f0] tracking-tight mb-2">
          Welcome back, <span className="font-semibold text-white">{userName}</span>
        </h1>
        <p className="text-[#8096a4] text-xs max-w-md mx-auto mb-7 font-normal">
          Load your municipal or regional infrastructure topology to model interdependencies and simulate systemic cascade risks.
        </p>

        {errorMessages.length > 0 && (
          <div className="mb-6 p-3.5 rounded-xl bg-red-950/40 border border-red-500/50 text-red-200 text-xs text-left space-y-1">
            <div className="font-semibold flex items-center gap-1.5 text-red-400">
              <AlertCircle className="w-4 h-4" /> Parsing Error
            </div>
            {errorMessages.map((msg, i) => (
              <div key={i}>{msg}</div>
            ))}
          </div>
        )}

        {/* Upload Cards */}
        <div className="space-y-3.5 mb-7">
          {/* File Upload Trigger */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="p-7 rounded-xl bg-[#0a1726]/80 border border-dashed border-[#84979a40] hover:border-[#a8e2dc] hover:bg-[#0d1e30] transition-all cursor-pointer flex flex-col items-center group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) processFile(f);
              }}
            />

            <div className="w-12 h-12 rounded-lg bg-[#071321] border border-[#84979a30] text-[#a8e2dc] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <UploadCloud className="w-6 h-6" />
            </div>

            <div className="text-xs font-semibold tracking-wider text-[#f2f4f0] uppercase mb-1">
              UPLOAD CSV / JSON DATASET
            </div>
            <p className="text-[11px] text-[#8096a4]">
              Drop your infrastructure file here or click to browse files
            </p>
          </div>

          {/* Sample Data Trigger */}
          <div className="flex items-center justify-between p-3.5 bg-[#0a1726]/60 border border-[#182c3f] rounded-xl">
            <div className="flex items-center gap-3 text-left">
              <div className="w-8 h-8 rounded-lg bg-[#071321] border border-[#84979a25] flex items-center justify-center text-[#a8e2dc]">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[#f2f4f0]">Need sample infrastructure?</div>
                <div className="text-[11px] text-[#8096a4]">
                  Metropolitan demo city with 28 services across 6 sectors
                </div>
              </div>
            </div>

            <button
              onClick={handleLoadSample}
              className="px-3.5 py-2 bg-[#071321] hover:bg-[#0d1e30] text-[#e1ede6] border border-[#84979a55] rounded-md text-xs font-semibold tracking-wider uppercase transition-all cursor-pointer"
            >
              TRY SAMPLE DATA
            </button>
          </div>
        </div>

        {/* Successful Upload State */}
        {dataset && (
          <div className="p-6 bg-[#0a1726] border border-[#84979a40] rounded-xl shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Dataset Loaded: {dataset.name}</span>
            </div>

            <div className="flex items-center justify-center gap-8 py-3 border-y border-[#182c3f] text-xs">
              <div>
                <span className="text-white text-base font-semibold">{dataset.assets.length}</span>{' '}
                <span className="text-[#8096a4] text-[11px] uppercase tracking-wider font-medium">Services</span>
              </div>
              <div>
                <span className="text-[#a8e2dc] text-base font-semibold">{dataset.dependencies.length}</span>{' '}
                <span className="text-[#8096a4] text-[11px] uppercase tracking-wider font-medium">Connections</span>
              </div>
              <div>
                <span className="text-amber-400 text-base font-semibold">{(dataset.sectors || []).length}</span>{' '}
                <span className="text-[#8096a4] text-[11px] uppercase tracking-wider font-medium">Sectors</span>
              </div>
            </div>

            <button
              onClick={onViewNetwork}
              className="w-full py-3 bg-[#e1ede6] hover:bg-white text-[#112826] font-semibold text-xs uppercase tracking-wider rounded-md shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98"
            >
              <span>EXPLORE CITY NETWORK</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
