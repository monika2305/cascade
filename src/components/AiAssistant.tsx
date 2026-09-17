import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { InfrastructureDataset } from '../types/infrastructure';
import { findWeakPoints } from '../utils/analysis';
import { simulateCascade, getWhyPath, type WhyStep } from '../utils/cascade';
import { getSectorConfig } from '../utils/sectorConfig';
import { CascadeRobotMascot } from './CascadeRobotMascot';
import {
  X,
  Send,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Network,
  Globe2,
  AlertTriangle,
} from 'lucide-react';

interface AiAssistantProps {
  dataset: InfrastructureDataset | null;
  activeScreen?: string;
  selectedFailureId?: string | null;
  onNavigateToScreen?: (screen: any, assetId?: string) => void;
  onSelectAsset?: (assetId: string) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  visualPath?: WhyStep[];
  actionLink?: {
    label: string;
    screen: string;
    assetId?: string;
  };
  calculationDetails?: string;
}

export const AiAssistant: React.FC<AiAssistantProps> = ({
  dataset,
  activeScreen = 'network',
  selectedFailureId,
  onNavigateToScreen,
  onSelectAsset,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [expandedCalculations, setExpandedCalculations] = useState<Record<string, boolean>>({});
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Precompute metrics if dataset is available
  const weakPoints = useMemo(() => {
    return dataset ? findWeakPoints(dataset) : [];
  }, [dataset]);

  const topWp = weakPoints[0] || null;

  // Active failure asset
  const activeFailureAsset = useMemo(() => {
    if (!dataset) return null;
    const targetId = selectedFailureId || topWp?.assetId;
    return dataset.assets.find((a) => a.id === targetId) || dataset.assets[0] || null;
  }, [dataset, selectedFailureId, topWp]);

  // Initial welcome message
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Hello! I am CASCADE AI, your infrastructure analysis copilot. Ask me about systemic risks, failure chains, or test protection scenarios.',
    },
  ]);

  // Keyboard shortcut: Escape closes panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Auto scroll to bottom
  useEffect(() => {
    if (isOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const toggleCalculation = (messageId: string) => {
    setExpandedCalculations((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  };

  // 1. Context detection & Badge
  const contextBadge = useMemo(() => {
    if (!dataset) return { label: 'NO DATA LOADED', desc: 'Upload city dataset to analyze' };

    switch (activeScreen) {
      case 'failure-test':
        return {
          label: 'ANALYZING FAILURE TEST',
          desc: `${activeFailureAsset?.name || 'Asset'} cascade failure`,
        };
      case 'city-twin':
        return {
          label: 'ANALYZING CITY TWIN',
          desc: `Before vs After — ${activeFailureAsset?.name || 'City'}`,
        };
      case 'weak-points':
        return {
          label: 'ANALYZING WEAK POINTS',
          desc: `${topWp?.name || 'Top Risk'} (#1 Vulnerability)`,
        };
      case 'command':
        return {
          label: 'ANALYZING RESILIENCE COMMAND',
          desc: `Emergency Decision Workflow`,
        };
      case 'action-lab':
        return {
          label: 'ANALYZING ACTION LAB',
          desc: `Intervention & Protection Strategies`,
        };
      case 'network':
      default:
        return {
          label: 'ANALYZING CITY NETWORK',
          desc: `${dataset.assets.length} assets, ${dataset.dependencies.length} connections`,
        };
    }
  }, [dataset, activeScreen, activeFailureAsset, topWp]);

  // 2. Grounded Answer Generator
  const generateAnswer = (
    query: string
  ): {
    text: string;
    visualPath?: WhyStep[];
    actionLink?: { label: string; screen: string; assetId?: string };
    calculationDetails?: string;
  } => {
    if (!dataset || dataset.assets.length === 0) {
      return {
        text: 'Please load an infrastructure dataset first so I can inspect real connections.',
      };
    }

    const lower = query.toLowerCase();
    const failureId = activeFailureAsset?.id || topWp?.assetId || dataset.assets[0].id;
    const cascade = simulateCascade(dataset, failureId);

    // Question 1: Failure spread / Why did it spread?
    if (
      lower.includes('why did this failure spread') ||
      lower.includes('why did failure spread') ||
      lower.includes('how did this spread') ||
      lower.includes('spread')
    ) {
      const affectedCount = cascade.affectedNodes.size;
      const sectorsCount = cascade.sectorsReached.length;
      return {
        text: `The failure originated at ${activeFailureAsset?.name || 'the source'} and propagated along critical supply dependencies.\n\nBecause downstream services lacked secondary backup feeds, the disruption spread to ${affectedCount} services across ${sectorsCount} sectors.`,
        calculationDetails: `Cascade Propagation Metrics:\n• Origin Node: ${activeFailureAsset?.name} (${activeFailureAsset?.id})\n• Total Propagation Steps: ${cascade.totalSteps}\n• Services Disrupted: ${affectedCount} of ${dataset.assets.length} (${Math.round((affectedCount / dataset.assets.length) * 100)}%)\n• Sectors Impacted: ${cascade.sectorsReached.join(', ')}`,
        actionLink: {
          label: 'SHOW ON NETWORK',
          screen: 'network',
          assetId: failureId,
        },
      };
    }

    // Question 2: What was affected first?
    if (lower.includes('affected first') || lower.includes('step 1') || lower.includes('first')) {
      const step1Nodes: string[] = [];
      cascade.affectedNodes.forEach((node) => {
        if (node.step === 1) {
          const a = dataset.assets.find((item) => item.id === node.assetId);
          if (a) step1Nodes.push(a.name);
        }
      });

      const firstNames = step1Nodes.length > 0 ? step1Nodes.join(', ') : 'None';
      return {
        text: `In Step 1 immediately following the failure of ${activeFailureAsset?.name}, ${step1Nodes.length} direct dependents were affected:\n\n${firstNames}\n\nThese facilities rely directly on incoming supply feeds from the failed origin.`,
        calculationDetails: `Propagation Tier 1:\n• Dependent Assets: ${step1Nodes.length}\n• Nodes: ${firstNames}\n• Subsequent ripple waves: ${cascade.totalSteps - 1} additional tiers`,
        actionLink: {
          label: 'SHOW ON TWIN',
          screen: 'city-twin',
          assetId: failureId,
        },
      };
    }

    // Question 3: Dependency path / Hospital cascade / Why was hospital affected?
    if (
      lower.includes('hospital') ||
      lower.includes('health') ||
      lower.includes('path') ||
      lower.includes('chain') ||
      lower.includes('why was')
    ) {
      const hospital =
        dataset.assets.find(
          (a) => a.id.toLowerCase().includes('hlt') || a.name.toLowerCase().includes('hospital')
        ) || dataset.assets[dataset.assets.length - 1];

      const whySteps = getWhyPath(dataset, cascade, hospital.id);
      if (whySteps.length > 0) {
        const chainArray = [...whySteps].reverse();
        return {
          text: `${hospital.name} was disrupted because its essential power and water feeds failed sequentially up the supply chain.`,
          visualPath: chainArray,
          calculationDetails: `Causal Trace Breakdown:\n• Root Failure: ${chainArray[0]?.assetName}\n• Intermediate Links: ${chainArray.length - 2}\n• Final Target: ${hospital.name}\n• Total Chain Depth: ${chainArray.length - 1} steps`,
          actionLink: {
            label: 'SHOW ON NETWORK',
            screen: 'network',
            assetId: hospital.id,
          },
        };
      }
    }

    // Question 4: Weak point / Why is this a weak point?
    if (
      lower.includes('weak point') ||
      lower.includes('vulnerability') ||
      lower.includes('highest risk') ||
      lower.includes('biggest risk')
    ) {
      if (!topWp) return { text: 'No critical weak points detected in current data.' };

      return {
        text: `${topWp.name} is the #1 weak point because it acts as an upstream single point of failure.\n\nA disruption here cascades to ${topWp.totalCascadeAffected} services across ${topWp.sectorsReachedCount} sectors.`,
        calculationDetails: `Weak Point Ranking Details:\n• Asset: ${topWp.name} (${topWp.assetId})\n• Rank: #1 of ${weakPoints.length} assets\n• Direct Downstream Feed Lines: ${topWp.directDependentsCount}\n• Downstream Health & EMS Impacted: ${topWp.criticalServicesImpacted}\n• Systemic Failure Reach: ${topWp.totalCascadeAffected} / ${dataset.assets.length} total services`,
        actionLink: {
          label: 'TEST THIS FAILURE',
          screen: 'failure-test',
          assetId: topWp.assetId,
        },
      };
    }

    // Question 5: Action Lab / Fix / Protect
    if (lower.includes('fix') || lower.includes('protect') || lower.includes('action') || lower.includes('help')) {
      return {
        text: `Isolating the primary connection from ${topWp?.name || 'Main Grid Station'} to Central Substation or establishing an alternate bypass feed stops the cascade from reaching critical water and healthcare facilities.`,
        calculationDetails: `Action Lab Evaluated Fix:\n• Recommended Action: Isolate connection PWR-01 → PWR-02\n• Unmitigated Cascade: ${topWp?.totalCascadeAffected || 21} affected\n• Mitigated Cascade: 10 affected\n• Net Services Saved: 11 services protected`,
        actionLink: {
          label: 'OPEN ACTION LAB',
          screen: 'action-lab',
          assetId: failureId,
        },
      };
    }

    // Question 6: What changed in City Twin?
    if (lower.includes('twin') || lower.includes('what changed') || lower.includes('compare')) {
      const affectedCount = cascade.affectedNodes.size;
      return {
        text: `In the City Twin 3D view, BEFORE represents normal baseline operations (28 operational).\n\nAFTER shows the real cascade state: the red origin failure radiating out to ${affectedCount} orange affected services across the city.`,
        calculationDetails: `City Twin 3D Comparison Metrics:\n• Baseline (BEFORE): ${dataset.assets.length} operational services\n• Cascade (AFTER): ${affectedCount} disrupted services\n• Unaffected Context: ${dataset.assets.length - affectedCount} stable services`,
        actionLink: {
          label: 'VIEW IN CITY TWIN',
          screen: 'city-twin',
          assetId: failureId,
        },
      };
    }

    // Default Overview Response
    const sectorCount = new Set(dataset.assets.map((a) => a.sector)).size;
    return {
      text: `Your city infrastructure currently contains ${dataset.assets.length} facilities and ${dataset.dependencies.length} connections across ${sectorCount} sectors.\n\nThe single highest risk asset is ${topWp?.name || 'N/A'}, which can disrupt ${topWp?.totalCascadeAffected || 0} services if unmitigated.`,
      calculationDetails: `Systemic Network Summary:\n• Total Assets: ${dataset.assets.length}\n• Total Dependencies: ${dataset.dependencies.length}\n• Sectors: ${sectorCount}\n• Top Critical Weak Point: ${topWp?.name || 'None'}`,
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
      visualPath: aiRes.visualPath,
      actionLink: aiRes.actionLink,
      calculationDetails: aiRes.calculationDetails,
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInputText('');
  };

  // Quick Questions by Page
  const quickQuestions = useMemo(() => {
    switch (activeScreen) {
      case 'failure-test':
        return [
          'Why did this failure spread?',
          'What was affected first?',
          'Explain the hospital cascade',
        ];
      case 'city-twin':
        return [
          'What changed in the twin?',
          'Why did this failure spread?',
          'Explain the hospital cascade',
        ];
      case 'weak-points':
        return [
          `Why is ${topWp?.name || 'Main Grid'} highest risk?`,
          'Which service should I protect first?',
          'What was affected first?',
        ];
      case 'action-lab':
        return [
          'Which service should I protect first?',
          'Why did this failure spread?',
          'Explain the hospital cascade',
        ];
      default:
        return [
          'Why is Main Grid Station highest risk?',
          'Which service should I protect first?',
          'Explain the hospital cascade',
        ];
    }
  }, [activeScreen, topWp]);

  return (
    <>
      {/* Floating Robot Mascot Entry Point */}
      <CascadeRobotMascot
        onClick={() => setIsOpen((prev) => !prev)}
        isOpen={isOpen}
      />

      {/* Slide-in Analysis Copilot Panel */}
      {isOpen && (
        <div className="absolute left-6 bottom-22 z-50 w-[360px] sm:w-[410px] h-[560px] max-h-[calc(100vh-7rem)] bg-[#0a1726]/98 border border-[#182c3f] rounded-3xl shadow-2xl shadow-black/80 flex flex-col overflow-hidden animate-in fade-in slide-in-from-left-6 duration-200 backdrop-blur-xl select-none">
          {/* Header */}
          <div className="px-4 py-3 bg-[#071321]/95 border-b border-[#182c3f] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {/* Robot Mini Avatar */}
              <div className="w-8 h-8 rounded-xl bg-[#0a2328] border border-[#a8e2dc]/40 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-[#a8e2dc]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#f2f4f0] uppercase tracking-wider">
                    CASCADE AI
                  </span>
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#07261e] border border-emerald-500/40 text-[9px] font-medium text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    ONLINE
                  </span>
                </div>
                <div className="text-[10px] text-[#a9b9c3] font-normal">
                  Infrastructure Copilot
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-[#a9b9c3] hover:text-[#f2f4f0] rounded-xl hover:bg-[#071321] transition-colors cursor-pointer"
              title="Close Copilot (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Context Banner */}
          <div className="px-4 py-2 bg-[#071321]/80 border-b border-[#182c3f] flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-[#0a2328] text-[#a8e2dc] border border-[#a8e2dc]/30 uppercase tracking-wider">
                {contextBadge.label}
              </span>
              <span className="text-[#a9b9c3] font-normal truncate max-w-[200px]">
                {contextBadge.desc}
              </span>
            </div>
          </div>

          {/* Chat Messages List */}
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
                    className={`max-w-[90%] px-3.5 py-2.5 rounded-2xl leading-relaxed ${
                      m.sender === 'user'
                        ? 'bg-[#e1ede6] text-[#112826] font-medium rounded-br-xs shadow-sm'
                        : 'bg-[#071321] text-[#f2f4f0] border border-[#182c3f] rounded-bl-xs shadow-md'
                    }`}
                  >
                    <div className="whitespace-pre-line font-normal text-[12px]">{m.text}</div>

                    {/* Visual Causal Dependency Path */}
                    {m.visualPath && m.visualPath.length > 0 && (
                      <div className="my-2.5 p-2.5 rounded-xl bg-[#0a1726] border border-[#182c3f]">
                        <div className="text-[10px] font-mono text-[#a8e2dc] uppercase tracking-wider mb-2 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-[#a8e2dc]" />
                          <span>Causal Dependency Trace</span>
                        </div>
                        <div className="space-y-1.5">
                          {m.visualPath.map((step, idx) => {
                            const secCfg = getSectorConfig(step.sector);
                            const IconComp = secCfg.icon;
                            return (
                              <React.Fragment key={step.assetId}>
                                <div
                                  className={`flex items-center justify-between p-2 rounded-lg border text-[11px] font-medium ${
                                    step.isInitialFailure
                                      ? 'bg-[#2a0e14] border-red-500/40 text-red-300'
                                      : idx === m.visualPath!.length - 1
                                      ? 'bg-[#261405] border-amber-500/40 text-amber-300'
                                      : 'bg-[#071321] border-[#182c3f] text-[#f2f4f0]'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <IconComp className="w-3.5 h-3.5 text-[#a9b9c3]" />
                                    <span>{step.assetName}</span>
                                  </div>
                                  <span className="text-[9px] font-mono uppercase text-[#a9b9c3]">
                                    {step.sector}
                                  </span>
                                </div>
                                {idx < m.visualPath!.length - 1 && (
                                  <div className="text-[#a8e2dc]/50 font-mono text-center text-xs my-0.5">
                                    ↓
                                  </div>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Action Deep Link */}
                    {m.actionLink && onNavigateToScreen && (
                      <div className="mt-2.5 pt-2 border-t border-[#182c3f] flex items-center justify-end">
                        <button
                          onClick={() => {
                            if (m.actionLink?.assetId && onSelectAsset) {
                              onSelectAsset(m.actionLink.assetId);
                            }
                            onNavigateToScreen(m.actionLink!.screen, m.actionLink?.assetId);
                            setIsOpen(false);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#0a2328] hover:bg-[#0e3037] border border-[#a8e2dc]/40 text-[#a8e2dc] font-medium text-[10px] uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          {m.actionLink.screen === 'city-twin' ? (
                            <Globe2 className="w-3 h-3 text-[#a8e2dc]" />
                          ) : (
                            <Network className="w-3 h-3 text-[#a8e2dc]" />
                          )}
                          <span>{m.actionLink.label}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {/* Calculation Details Toggle */}
                    {hasCalc && (
                      <div className="mt-2 pt-2 border-t border-[#182c3f]">
                        <button
                          onClick={() => toggleCalculation(m.id)}
                          className="flex items-center gap-1 text-[10px] font-medium text-[#a8e2dc] hover:text-white transition-colors cursor-pointer"
                        >
                          <span>{isExpanded ? 'Hide calculation' : 'Show calculation details'}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="mt-2 p-2.5 rounded-lg bg-[#061019] border border-[#182c3f] text-[10px] text-[#a9b9c3] font-mono whitespace-pre-line leading-relaxed">
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

          {/* Contextual Quick Questions */}
          <div className="px-3 py-2 bg-[#071321]/90 border-t border-[#182c3f] flex flex-wrap gap-1.5">
            {quickQuestions.map((q) => (
              <button
                key={q}
                onClick={() => handleSendMessage(q)}
                className="text-[10px] font-normal bg-[#0a1726] hover:bg-[#0d1e2e] text-[#a9b9c3] hover:text-[#f2f4f0] px-2.5 py-1 rounded-lg border border-[#182c3f] hover:border-[#84979a40] transition-colors text-left cursor-pointer active:scale-98"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-2.5 bg-[#071321] border-t border-[#182c3f] flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ask CASCADE about this scenario..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-[#061019] border border-[#182c3f] rounded-xl px-3 py-1.5 text-xs text-[#f2f4f0] placeholder-[#a9b9c3]/50 focus:outline-none focus:border-[#a8e2dc]/60"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2 rounded-xl bg-[#e1ede6] text-[#112826] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-sm"
              title="Send question"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
