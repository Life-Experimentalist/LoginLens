import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, 
  Download, 
  ExternalLink, 
  Sparkles,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Terminal,
  HelpCircle,
  Cpu
} from 'lucide-react';
import { 
  ChromeIcon, 
  FirefoxIcon, 
  EdgeIcon, 
  BraveIcon, 
  OperaIcon, 
  SafariIcon 
} from './BrowserIcons';
import { detectBrowser, getBrowserDetails, type BrowserType } from '../utils/browserDetector';
import { EXTERNAL_LINK_PROPS, LATEST_RELEASE_URL, RELEASES_URL, REPO_URL } from '../constants/links';

function renderBrowserIcon(browser: string, className = "w-9 h-9") {
  switch (browser.toLowerCase()) {
    case 'chrome': 
    case 'arc':
    case 'vivaldi': return <ChromeIcon className={className} />;
    case 'firefox': 
    case 'waterfox':
    case 'librewolf': return <FirefoxIcon className={className} />;
    case 'edge': return <EdgeIcon className={className} />;
    case 'brave': return <BraveIcon className={className} />;
    case 'opera': return <OperaIcon className={className} />;
    case 'safari': 
    case 'orion': return <SafariIcon className={className} />;
    default: return <HelpCircle className={`${className} text-indigo-400`} />;
  }
}

export const ExtensionDetector: React.FC = () => {
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  // Read from the attribute the extension stamps on <html>, never hardcoded —
  // a literal here claims a version the visitor may not actually be running.
  const [version, setVersion] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [userBrowser, setUserBrowser] = useState<BrowserType>('chrome');
  const [expandedBrowser, setExpandedBrowser] = useState<string | null>(null);
  const [showOtherDownloads, setShowOtherDownloads] = useState<boolean>(false);

  useEffect(() => {
    const detected = detectBrowser();
    setUserBrowser(detected);

    const checkState = () => {
      const hasAttr = document.documentElement.getAttribute('data-loginlens-installed') === 'true' ||
                      document.documentElement.hasAttribute('data-loginlens-installed') ||
                      document.body?.getAttribute('data-loginlens-installed') === 'true';
      const hasGlobal = (window as any).__LOGINLENS_INSTALLED__ === true;

      if (hasAttr || hasGlobal) {
        setIsInstalled(true);
        setVersion(document.documentElement.getAttribute('data-loginlens-version'));
        setIsChecking(false);
        return true;
      }
      return false;
    };

    if (checkState()) return;

    const observer = new MutationObserver(() => {
      if (checkState()) observer.disconnect();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-loginlens-installed', 'data-loginlens-version']
    });

    const handleInstalled = (event: Event) => {
      setIsInstalled(true);
      const detail = (event as CustomEvent<{ version?: string }>).detail;
      setVersion(
        detail?.version ??
          document.documentElement.getAttribute('data-loginlens-version')
      );
      setIsChecking(false);
      observer.disconnect();
    };

    window.addEventListener('LOGINLENS_EXTENSION_DETECTED', handleInstalled);
    window.addEventListener('loginlens-installed', handleInstalled);

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (checkState() || attempts >= 10) {
        clearInterval(interval);
        setIsChecking(false);
      }
    }, 300);

    return () => {
      observer.disconnect();
      // Must match the names registered above — a third spelling removes
      // nothing and leaves both listeners attached after unmount.
      window.removeEventListener('LOGINLENS_EXTENSION_DETECTED', handleInstalled);
      window.removeEventListener('loginlens-installed', handleInstalled);
      clearInterval(interval);
    };
  }, []);

  const allBrowserIds: BrowserType[] = ['chrome', 'firefox', 'edge', 'brave', 'opera', 'safari'];
  
  // Arrange so detected browser comes FIRST as the dedicated showcase
  const primaryId = userBrowser;
  const secondaryIds = allBrowserIds.filter((id) => id !== primaryId);
  const orderedIds = [primaryId, ...secondaryIds];

  const primaryDetails = getBrowserDetails(primaryId);

  return (
    <div className="w-full max-w-7xl mx-auto my-14 px-6 scale-105 transform-gpu transition-all">
      <AnimatePresence mode="wait">
        {isChecking ? (
          <motion.div
            key="checking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-8 rounded-3xl bg-zinc-900/60 border border-zinc-800 text-center backdrop-blur-xl"
          >
            <p className="text-sm font-semibold text-zinc-400 flex items-center justify-center gap-2">
              <span className="w-3 h-3 rounded-full bg-indigo-500 animate-ping" />
              Detecting LoginLens Extension status...
            </p>
          </motion.div>
        ) : isInstalled ? (
          /* Installed State */
          <motion.div
            key="installed"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-10 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 backdrop-blur-2xl shadow-2xl relative overflow-hidden"
          >
            <div className="flex items-center justify-between flex-wrap gap-6">
              <div className="flex items-center gap-5">
                <div className="p-5 bg-emerald-500/20 rounded-2xl text-emerald-400">
                  <CheckCircle2 size={42} />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-2xl font-extrabold text-zinc-100">
                      LoginLens Extension is Installed & Active!
                    </h3>
                    <span className="px-3 py-1 rounded-full text-xs uppercase font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                      {version ? `Connected v${version}` : 'Connected'}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">
                    Your vault lives in this browser's own storage. No account, no backend, no telemetry.
                  </p>
                </div>
              </div>

              <a
                href={REPO_URL}
                {...EXTERNAL_LINK_PROPS}
                className="px-7 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-sm transition-all shadow-lg flex items-center gap-2"
              >
                <ShieldCheck size={18} /> Extension Active
              </a>
            </div>

            {/* Collapsible dropdown for installed users to view other browser targets */}
            <div className="mt-8 pt-6 border-t border-emerald-500/20 flex flex-col items-center">
              <button
                onClick={() => setShowOtherDownloads(!showOtherDownloads)}
                className="px-5 py-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-semibold flex items-center gap-2 transition-all shadow-md group"
              >
                <span>{showOtherDownloads ? 'Hide Package Downloads & Other Browsers' : 'Download for Other Browsers & Package Targets (Firefox, Safari, Edge, Side-load Zip)'}</span>
                {showOtherDownloads ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              <AnimatePresence>
                {showOtherDownloads && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="w-full mt-8 pt-6 border-t border-zinc-800/80 space-y-6 text-left"
                  >
                    <p className="text-xs text-zinc-400 font-medium text-center">
                      Officially supported Plasmo build targets: <code className="text-indigo-400">chrome-mv3</code>, <code className="text-indigo-400">firefox-mv2</code>, <code className="text-indigo-400">firefox-mv3</code>, <code className="text-indigo-400">edge-mv3</code>, <code className="text-indigo-400">brave-mv3</code>, <code className="text-indigo-400">opera-mv3</code>, <code className="text-indigo-400">safari-mv3</code>.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {(['chrome', 'firefox', 'edge', 'brave', 'opera', 'safari'] as BrowserType[]).map((bKey) => {
                        const details = getBrowserDetails(bKey);
                        return (
                          <div
                            key={bKey}
                            className="p-6 rounded-2xl bg-zinc-950/80 border border-zinc-800 flex flex-col justify-between space-y-4 hover:border-zinc-700 transition-all"
                          >
                            <div className="flex items-center gap-3">
                              {renderBrowserIcon(bKey, "w-8 h-8")}
                              <div>
                                <h4 className="font-bold text-zinc-100 text-sm">{details.name}</h4>
                                <p className="text-[11px] font-mono text-indigo-400">{details.plasmoTarget}</p>
                              </div>
                            </div>
                            <p className="text-xs text-zinc-400 leading-relaxed">
                              {details.installationSteps[0]?.description || 'Sideload via developer mode zip.'}
                            </p>
                            <div className="flex items-center gap-2 pt-2">
                              <a
                                href={RELEASES_URL}
                                {...EXTERNAL_LINK_PROPS}
                                className="flex-1 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
                              >
                                <Download size={14} /> Download Zip
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          /* Not Installed State — Perfectly Balanced 3x2 Grid (6 Cards Total) */
          <motion.div
            key="not-installed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-10 rounded-3xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-2xl shadow-2xl space-y-10"
          >
            <div className="flex items-center justify-between flex-wrap gap-4 border-b border-zinc-800 pb-8">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-3 py-1 rounded-full text-xs uppercase font-extrabold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1.5">
                    <Cpu size={14} /> Plasmo Extension Sideload Center
                  </span>
                  <span className="text-sm text-zinc-400 font-medium">
                    Detected Browser: <strong className="text-indigo-300 capitalize">{primaryDetails.name}</strong>
                  </span>
                </div>
                <h3 className="text-4xl font-extrabold text-zinc-50 tracking-tight">
                  Download & Sideload LoginLens
                </h3>
              </div>

              <a
                href={LATEST_RELEASE_URL}
                {...EXTERNAL_LINK_PROPS}
                className="px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/30"
              >
                <Download size={18} /> GitHub Releases
              </a>
            </div>

            {/* PERFECTLY BALANCED 3-COLUMN x 2-ROW GRID (6 CARDS TOTAL) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {orderedIds.map((id) => {
                const isPrimary = id === primaryId;
                const details = getBrowserDetails(id);
                const isExpanded = expandedBrowser === id || isPrimary;

                return (
                  <div
                    key={id}
                    className={`p-7 rounded-3xl transition-all flex flex-col justify-between space-y-6 ${
                      isPrimary
                        ? 'bg-gradient-to-br from-indigo-950/80 via-indigo-900/40 to-zinc-950 border-2 border-indigo-500 shadow-2xl shadow-indigo-600/20 col-span-1 md:col-span-2 lg:col-span-3'
                        : 'bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-4">
                          <div className={`p-3.5 rounded-2xl border shrink-0 ${isPrimary ? 'bg-zinc-900 border-indigo-500/50' : 'bg-zinc-900 border-zinc-800'}`}>
                            {renderBrowserIcon(details.id, isPrimary ? "w-10 h-10" : "w-8 h-8")}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              {isPrimary && (
                                <span className="px-3 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] font-extrabold uppercase tracking-wider">
                                  ★ Detected Browser
                                </span>
                              )}
                              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-mono font-bold">
                                --target={details.plasmoTarget}
                              </span>
                            </div>
                            <h4 className={`font-extrabold text-zinc-50 ${isPrimary ? 'text-2xl' : 'text-lg'}`}>{details.name}</h4>
                          </div>
                        </div>

                        {!isPrimary && (
                          <button
                            onClick={() => setExpandedBrowser(isExpanded && expandedBrowser === id ? null : id)}
                            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold transition-all flex items-center gap-1.5"
                          >
                            {isExpanded && expandedBrowser === id ? 'Hide Guide' : 'Sideload Guide'}
                            {isExpanded && expandedBrowser === id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                      </div>

                      {/* Step-by-Step Installation Instructions */}
                      {(isPrimary || (isExpanded && expandedBrowser === id)) && (
                        <div className="pt-4 border-t border-zinc-800/80 space-y-3">
                          <h5 className="text-xs font-extrabold uppercase tracking-wider text-indigo-300 flex items-center gap-2">
                            <Terminal size={14} /> Installation Steps for {details.name}
                          </h5>
                          <div className={`grid gap-3 text-xs ${isPrimary ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1'}`}>
                            {details.installationSteps.map((step) => (
                              <div key={step.step} className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col justify-between space-y-2">
                                <div>
                                  <span className="w-5 h-5 rounded-full bg-indigo-500/30 text-indigo-300 font-bold text-[10px] flex items-center justify-center mb-1">
                                    {step.step}
                                  </span>
                                  <strong className="text-zinc-100 font-bold block">{step.title}</strong>
                                  <p className="text-zinc-400 mt-1 text-[11px] leading-relaxed">{step.description}</p>
                                </div>
                                {step.code && (
                                  <code className="p-1.5 rounded bg-zinc-950 border border-zinc-800 text-indigo-300 font-mono text-[10px] block overflow-x-auto select-all">
                                    {step.code}
                                  </code>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-zinc-800/60 flex items-center justify-between text-xs">
                      <a
                        href={LATEST_RELEASE_URL}
                        {...EXTERNAL_LINK_PROPS}
                        className="font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 transition-colors text-sm"
                      >
                        <Download size={16} /> Download {details.name} Build
                      </a>
                      <ExternalLink size={14} className="text-zinc-600" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Smart Fallback & Unrecognized Browser Handler */}
            <div className="p-8 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-4">
              <h4 className="text-sm font-extrabold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-400" /> Custom Browser Fork or Unlisted Platform?
              </h4>
              <p className="text-xs md:text-sm text-zinc-400 leading-relaxed">
                LoginLens compiles natively using Plasmo's multi-browser targets: <code className="text-indigo-400 font-mono">chrome-mv3</code>, <code className="text-indigo-400 font-mono">firefox-mv2</code>, <code className="text-indigo-400 font-mono">firefox-mv3</code>, <code className="text-indigo-400 font-mono">edge-mv3</code>, <code className="text-indigo-400 font-mono">brave-mv3</code>, <code className="text-indigo-400 font-mono">opera-mv3</code>, and <code className="text-indigo-400 font-mono">safari-mv3</code> (via <code className="text-indigo-300 font-mono">safari-web-extension-converter</code>). All Chromium forks (Vivaldi, Arc, Orion) load standard MV3 packages, while Gecko forks (Waterfox, LibreWolf) load WebExt packages.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
