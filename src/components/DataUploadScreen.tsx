import { useState, useRef } from 'react';
import type React from 'react';
import { UploadCloud, FileText, AlertCircle, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import type { InfrastructureDataset, ParseResult } from '../types/infrastructure';
import { parseInfrastructureFile } from '../utils/parser';
import sampleCascadeCity from '../data/sample_cascade_city.json';

interface DataUploadScreenProps {
  onDatasetLoaded: (dataset: InfrastructureDataset) => void;
  onBack: () => void;
}

export const DataUploadScreen: React.FC<DataUploadScreenProps> = ({ onDatasetLoaded }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [loadedDataset, setLoadedDataset] = useState<InfrastructureDataset | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleParsed = (dataset: InfrastructureDataset) => {
    setIsProcessing(false);
    setLoadedDataset(dataset);
  };

  const processFile = (file: File) => {
    setErrorMessages([]);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        const result: ParseResult = parseInfrastructureFile(file.name, content);
        if (result.success && result.dataset) {
          handleParsed({
            ...result.dataset,
            isSample: false,
          });
        } else {
          setIsProcessing(false);
          setErrorMessages(result.errors || ['Could not read infrastructure data from this file.']);
        }
      } catch {
        setIsProcessing(false);
        setErrorMessages(['An unexpected error occurred while reading the file. Please check its contents.']);
      }
    };

    reader.onerror = () => {
      setIsProcessing(false);
      setErrorMessages(['Failed to read file from disk.']);
    };

    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handleUseSampleCity = () => {
    setErrorMessages([]);
    setIsProcessing(true);
    setTimeout(() => {
      const result = parseInfrastructureFile('CASCADE Demo City.json', JSON.stringify(sampleCascadeCity));
      if (result.success && result.dataset) {
        handleParsed({
          ...result.dataset,
          isSample: true,
        });
      } else {
        setIsProcessing(false);
      }
    }, 100);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 flex-1 flex flex-col justify-center">
      {/* Heading */}
      <div className="text-center mb-8">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-2 tracking-tight">
          Add Your City Data
        </h2>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Upload real infrastructure data or explore with our preloaded city network.
        </p>
      </div>

      {/* Error messages banner */}
      {errorMessages.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-red-300">Could not load dataset</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5 text-red-300/90 text-xs">
              {errorMessages.map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* State A: Two Clear Choices (When No Data Loaded) */}
      {!loadedDataset ? (
        <div className="space-y-4">
          {/* Choice 1: Upload CSV / JSON */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`p-8 rounded-2xl border-2 border-dashed transition-all duration-200 text-center cursor-pointer flex flex-col items-center justify-center ${
              isDragging
                ? 'border-cyan-400 bg-cyan-950/30 ring-4 ring-cyan-500/10'
                : 'border-slate-800 hover:border-slate-700 bg-slate-900/50 hover:bg-slate-900/80'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,.txt"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-3 shadow-inner">
              <UploadCloud className="w-7 h-7 stroke-[1.75]" />
            </div>

            <h3 className="text-base font-bold text-white mb-1">
              Upload CSV / JSON
            </h3>
            <p className="text-slate-400 text-xs mb-3">
              Drop file here or click to browse
            </p>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-[11px] text-slate-300 font-medium">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Supports CSV and JSON format</span>
            </div>

            {isProcessing && (
              <p className="text-xs text-amber-400 mt-3 animate-pulse font-medium">
                Reading infrastructure file...
              </p>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 text-xs text-slate-500 font-bold uppercase tracking-wider py-1">
            <span>— OR —</span>
          </div>

          {/* Choice 2: Use Sample City */}
          <button
            onClick={handleUseSampleCity}
            className="w-full p-5 rounded-2xl bg-slate-900/70 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/60 text-left transition-all duration-200 cursor-pointer flex items-center justify-between group shadow-lg"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <div className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                  Use Sample City
                </div>
                <div className="text-xs text-slate-400">
                  Preloaded 28 assets across 6 connected sectors
                </div>
              </div>
            </div>

            <span className="px-4 py-2 rounded-xl bg-cyan-500 group-hover:bg-cyan-400 text-slate-950 font-black text-xs transition-colors">
              Load Sample →
            </span>
          </button>
        </div>
      ) : (
        /* State B: Successful Parsing -> Show ONLY 3 Stats + Big Button */
        <div className="p-8 rounded-3xl bg-slate-900/90 border-2 border-cyan-500/60 shadow-2xl text-center animate-fade-in space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Data Ready: {loadedDataset.name}</span>
          </div>

          {/* 3 Clean Calculated Stats */}
          <div className="grid grid-cols-3 gap-4 py-4 border-y border-slate-800">
            <div>
              <div className="text-4xl font-black text-white font-mono">
                {loadedDataset.assets.length}
              </div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">
                Assets
              </div>
            </div>

            <div className="border-x border-slate-800">
              <div className="text-4xl font-black text-cyan-300 font-mono">
                {loadedDataset.dependencies.length}
              </div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">
                Connections
              </div>
            </div>

            <div>
              <div className="text-4xl font-black text-amber-300 font-mono">
                {loadedDataset.sectors.length}
              </div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">
                Sectors
              </div>
            </div>
          </div>

          {/* Obvious Primary Action Button */}
          <button
            onClick={() => onDatasetLoaded(loadedDataset)}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-black text-base shadow-xl shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 tracking-wide uppercase"
          >
            <span>VIEW CITY NETWORK</span>
            <ArrowRight className="w-5 h-5" />
          </button>

          <div>
            <button
              onClick={() => setLoadedDataset(null)}
              className="text-xs text-slate-500 hover:text-slate-300 underline cursor-pointer"
            >
              Choose different data
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
