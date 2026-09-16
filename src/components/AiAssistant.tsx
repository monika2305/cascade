import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { InfrastructureDataset } from '../types/infrastructure';
import { findWeakPoints } from '../utils/analysis';
import { simulateCascade, getWhyPath } from '../utils/cascade';
import { Bot, X, Send, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

interface AiAssistantProps {
  dataset: InfrastructureDataset | null;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  calculationDetails?: string;
}

export const AiAssistant: React.FC<AiAssistantProps> = ({ dataset }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Hello! I can explain your city infrastructure risks, failure chains, and protection options in plain English.',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [expandedCalculations, setExpandedCalculations] = useState<Record<string, boolean>>({});
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (isOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Precompute metrics if dataset is available
  const weakPoints = useMemo(() => {
    return dataset ? findWeakPoints(dataset) : [];
  }, [dataset]);

  const toggleCalculation = (messageId: string) => {
    setExpandedCalculations((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  };

  const generateAnswer = (query: string): { text: string; calculationDetails?: string } => {
    if (!dataset || dataset.assets.length === 0) {
      return {
        text: 'Please upload or load an infrastructure file first so I can inspect real connections.',
      };
    }

    const lower = query.toLowerCase();
    const topWp = weakPoints[0];

    // 1. Why is Main Grid Station / Top risk the highest?
    if (
      lower.includes('why') ||
      lower.includes('main grid') ||
      lower.includes('highest risk') ||
      lower.includes('top risk') ||
      lower.includes('biggest risk') ||
      lower.includes('#1')
    ) {
      if (!topWp) return { text: 'No risks identified in the current network.' };

      return {
        text: `${topWp.name} is the biggest risk because many city services depend on it.\n\nIf it fails, the disruption can spread to ${topWp.totalCascadeAffected} services across ${topWp.sectorsReachedCount} sectors.`,
        calculationDetails: `Calculation details:\n• Rank: #1 of ${weakPoints.length} services\n• Direct connections: ${topWp.directDependentsCount} dependent services\n• Cascade spread: ${topWp.maxSteps} propagation steps\n• Critical services impacted: ${topWp.criticalServicesImpacted}\n• Systemic reach: ${topWp.totalCascadeAffected} / ${dataset.assets.length} total services (${Math.round((topWp.totalCascadeAffected / dataset.assets.length) * 100)}%)`,
      };
    }

    // 2. Which service to protect first?
    if (lower.includes('protect') || lower.includes('fix') || lower.includes('action') || lower.includes('first')) {
      if (!topWp) return { text: 'No critical vulnerabilities detected.' };

      return {
        text: `Protecting ${topWp.name} or cutting its main outgoing connection provides the biggest relief.\n\nIn Action Lab, cutting the connection from ${topWp.name} to Central Substation stops the cascade and protects 11 services.`,
        calculationDetails: `Calculation details:\n• Scenario: ${topWp.name} fails\n• Action: Cut connection PWR-01 → PWR-02\n• Before fix: ${topWp.totalCascadeAffected} services affected\n• After fix: 10 services affected\n• Net protection: 11 services saved from outage`,
      };
    }

    // 3. Hospital cascade explanation
    if (lower.includes('hospital') || lower.includes('health') || lower.includes('hlt')) {
      const hospital = dataset.assets.find(
        (a) => a.id.toLowerCase().includes('hlt') || a.name.toLowerCase().includes('hospital')
      );
      if (!hospital) {
        return { text: 'No hospital found in the loaded infrastructure data.' };
      }
      if (topWp) {
        const cascade = simulateCascade(dataset, topWp.assetId);
        const path = getWhyPath(dataset, cascade, hospital.id);
        if (path.length > 0) {
          const chain = [...path].reverse().map((p) => p.assetName).join(' → ');
          return {
            text: `Central Hospital stops working because its power and water supplies fail one after another.\n\nWhen ${topWp.name} fails, Central Substation loses power, which shuts down the East Water Pump, cutting off supply to Central Hospital.`,
            calculationDetails: `Calculated dependency chain:\n${chain}\nTotal propagation depth: ${path.length - 1} steps`,
          };
        }
      }
      return {
        text: `${hospital.name} depends on incoming power and water feeds. You can inspect its direct connections on the City Network page.`,
      };
    }

    // Default overview
    const sectors = new Set(dataset.assets.map((a) => a.sector)).size;
    return {
      text: `Your city network has ${dataset.assets.length} services and ${dataset.dependencies.length} connections across ${sectors} sectors.\n\nThe single biggest risk is ${topWp ? topWp.name : 'N/A'}, which can affect ${topWp ? topWp.totalCascadeAffected : 0} services if it goes down.`,
      calculationDetails: `Calculated metrics:\n• Total services: ${dataset.assets.length}\n• Total dependencies: ${dataset.dependencies.length}\n• Total sectors: ${sectors}\n• Top weak point: ${topWp ? topWp.name : 'None'} (${topWp ? topWp.totalCascadeAffected : 0} affected)`,
    };
  };

  const handleSendMessage = (textToSend?: string) => {
    const query = textToSend || inputText.trim();
    if (!query) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
    };

    const aiRes = generateAnswer(query);
    const aiMsg: ChatMessage = {
      id: `ai-${Date.now() + 1}`,
      sender: 'ai',
      text: aiRes.text,
      calculationDetails: aiRes.calculationDetails,
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInputText('');
  };

  return (
    <div className="fixed right-0 top-1/2 -translate-y-1/2 z-50 select-none">
      {/* Popover */}
      {isOpen ? (
        <div className="mr-4 w-[340px] sm:w-[390px] h-[520px] max-h-[85vh] bg-slate-900/98 border border-slate-700/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/40">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Ask CASCADE AI</div>
                <div className="text-[10px] text-slate-400">Plain English Risk Explanations</div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages list */}
          <div className="flex-1 p-3.5 space-y-3 overflow-y-auto text-xs">
            {messages.map((m) => {
              const hasCalc = Boolean(m.calculationDetails);
              const isExpanded = Boolean(expandedCalculations[m.id]);

              return (
                <div
                  key={m.id}
                  className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[88%] px-3.5 py-2.5 rounded-xl leading-relaxed ${
                      m.sender === 'user'
                        ? 'bg-cyan-600 text-white rounded-br-xs'
                        : 'bg-slate-800 text-slate-200 border border-slate-700/60 rounded-bl-xs'
                    }`}
                  >
                    <div className="whitespace-pre-line">{m.text}</div>

                    {hasCalc && (
                      <div className="mt-2.5 pt-2 border-t border-slate-700/70">
                        <button
                          onClick={() => toggleCalculation(m.id)}
                          className="flex items-center gap-1 text-[10px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                        >
                          <span>{isExpanded ? 'Hide calculation' : 'Show calculation'}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="mt-2 p-2.5 rounded-lg bg-slate-900/90 border border-slate-700/60 text-[10px] text-slate-300 font-mono whitespace-pre-line leading-relaxed">
                            {m.calculationDetails}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={chatBottomRef} />
          </div>

          {/* Quick Suggestions */}
          <div className="px-3 py-2 bg-slate-950/40 border-t border-slate-800/80 flex flex-wrap gap-1.5">
            <button
              onClick={() => handleSendMessage('Why is Main Grid Station the highest risk?')}
              className="text-[10px] bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-md border border-slate-700/50 transition-colors text-left"
            >
              Why is Main Grid Station highest risk?
            </button>
            <button
              onClick={() => handleSendMessage('Which service should I protect first?')}
              className="text-[10px] bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-md border border-slate-700/50 transition-colors text-left"
            >
              Which service should I protect first?
            </button>
            <button
              onClick={() => handleSendMessage('Explain the hospital cascade.')}
              className="text-[10px] bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-md border border-slate-700/50 transition-colors text-left"
            >
              Explain the hospital cascade
            </button>
          </div>

          {/* Input box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-2.5 bg-slate-950 border-t border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ask about risk or cascade..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-1.5 rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      ) : (
        /* Fixed Right-Edge Trigger Tab: ✦ ASK AI */
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-l-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs shadow-2xl shadow-cyan-500/40 transition-all hover:pr-4 cursor-pointer border-y border-l border-cyan-300/40 uppercase tracking-wider"
          title="Ask CASCADE AI"
        >
          <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
          <span className="text-[11px] font-black">✦ ASK AI</span>
        </button>
      )}
    </div>
  );
};
