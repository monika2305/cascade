import React, { useState, useRef } from 'react';
import type { InfrastructureDataset, ParseResult } from '../types/infrastructure';
import { parseInfrastructureFile } from '../utils/parser';
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
    onDatasetLoaded(sampleCascadeCity as unknown as InfrastructureDataset);
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950 text-slate-100 overflow-y-auto">
      <div className="w-full max-w-xl text-center">
        {/* Welcome greeting */}
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-2">
          Welcome, {userName}
        </h1>
        <p className="text-slate-400 text-sm mb-8">
          Upload your city infrastructure file to analyze dependencies and cascades.
        </p>

        {errorMessages.length > 0 && (
          <div className="mb-6 p-4 rounded-2xl bg-red-950/40 border border-red-500/50 text-red-200 text-xs text-left space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-red-400">
              <AlertCircle className="w-4 h-4" /> Parsing Error
            </div>
            {errorMessages.map((msg, i) => (
              <div key={i}>{msg}</div>
            ))}
          </div>
        )}

        {/* Upload Cards */}
        <div className="space-y-4 mb-8">
          {/* File Upload Trigger */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="p-8 rounded-3xl bg-slate-900/80 border-2 border-dashed border-slate-700 hover:border-cyan-500 hover:bg-slate-900 transition-all cursor-pointer flex flex-col items-center group"
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

            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <UploadCloud className="w-7 h-7" />
            </div>

            <div className="text-base font-bold text-white mb-1">
              UPLOAD CSV / JSON
            </div>
            <p className="text-xs text-slate-400">
              Drop your infrastructure file here or click to browse
            </p>
          </div>

          {/* Sample Data Trigger */}
          <div className="flex items-center justify-between p-4 bg-slate-900/60 border border-slate-800 rounded-2xl">
            <div className="flex items-center gap-3 text-left">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Need sample data?</div>
                <div className="text-[11px] text-slate-400">
                  Demo city with 28 services across 6 sectors
                </div>
              </div>
            </div>

            <button
              onClick={handleLoadSample}
              className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              TRY SAMPLE DATA
            </button>
          </div>
        </div>

        {/* Successful Upload State */}
        {dataset && (
          <div className="p-6 bg-slate-900 border border-cyan-500/50 rounded-3xl shadow-xl shadow-cyan-950/30 space-y-4 animate-fade-in">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Data Ready: {dataset.name}</span>
            </div>

            <div className="flex items-center justify-center gap-6 py-2 border-y border-slate-800 text-xs font-mono">
              <div>
                <strong className="text-white text-base">{dataset.assets.length}</strong>{' '}
                <span className="text-slate-400">Services</span>
              </div>
              <div>
                <strong className="text-cyan-400 text-base">{dataset.dependencies.length}</strong>{' '}
                <span className="text-slate-400">Connections</span>
              </div>
              <div>
                <strong className="text-amber-400 text-base">{dataset.sectors.length}</strong>{' '}
                <span className="text-slate-400">Sectors</span>
              </div>
            </div>

            <button
              onClick={onViewNetwork}
              className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-cyan-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98"
            >
              <span>VIEW CITY NETWORK</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
