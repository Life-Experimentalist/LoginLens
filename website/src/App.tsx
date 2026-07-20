import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Globe, Github, Lock, Database, Key, Eye, Download, Code, ChevronDown, Zap, FileKey, Check, X, AlertTriangle, Users, Star, GitMerge, Scale } from 'lucide-react';

const DocsSection: React.FC = () => {
  const [openSection, setOpenSection] = useState<string | null>('installation');

  const docs = [
    {
      id: 'installation',
      title: 'Installation',
      content: (
        <div className="space-y-4 text-zinc-300">
          <p>LoginLens is available as an open-source Chrome Extension (Manifest V3).</p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>Download the latest release from GitHub.</li>
            <li>Unzip the downloaded file.</li>
            <li>Open Chrome and navigate to <code className="bg-zinc-800 px-1 py-0.5 rounded text-indigo-400">chrome://extensions</code>.</li>
            <li>Enable <strong>Developer mode</strong> in the top right.</li>
            <li>Click <strong>Load unpacked</strong> and select the unzipped directory.</li>
          </ol>
        </div>
      ),
    },
    {
      id: 'oauth',
      title: 'How OAuth Recording Works',
      content: (
        <div className="space-y-4 text-zinc-300">
          <p>The Universal OAuth Recorder runs seamlessly in the background. It intercepts and analyzes OAuth flows (like "Sign in with Google" or "Sign in with GitHub") to capture the application and identity mapping without ever sending data to external servers.</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Uses Chrome's Declarative Net Request API.</li>
            <li>Intercepts standard OAuth 2.0 authorization codes and tokens.</li>
            <li>Locally correlates the requesting application with the identity provider.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'importing',
      title: 'Importing Passwords',
      content: (
        <div className="space-y-4 text-zinc-300">
          <p>You can import existing credentials from other password managers or browsers.</p>
          <p>LoginLens supports CSV imports from:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Google Chrome & Microsoft Edge</li>
            <li>Bitwarden & 1Password</li>
          </ul>
          <p>Every imported record is tagged with its source provenance, allowing you to trace where a password originated.</p>
        </div>
      ),
    },
    {
      id: 'apikeys',
      title: 'API Keys Storage',
      content: (
        <div className="space-y-4 text-zinc-300">
          <p>Developers can securely store API keys in the Vault. Keys are obfuscated by default and require a click-to-reveal action.</p>
          <div className="bg-zinc-950 p-4 rounded-md border border-zinc-800 font-mono text-sm">
            <span className="text-zinc-500">// Example format</span><br/>
            <span className="text-purple-400">const</span> apiKey = <span className="text-green-400">"sk_live_..."</span>;
          </div>
        </div>
      ),
    },
    {
      id: 'privacy',
      title: 'Privacy & Architecture',
      content: (
        <div className="space-y-4 text-zinc-300">
          <p>LoginLens is designed with a strict zero-server architecture. <strong>All data stays on your machine.</strong></p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Storage:</strong> Utilizes <code className="bg-zinc-800 px-1 py-0.5 rounded text-indigo-400">chrome.storage.local</code>.</li>
            <li><strong>Telemetry:</strong> Completely disabled. No analytics, no tracking.</li>
            <li><strong>Sync:</strong> No cloud sync. To move data, use the secure export/import feature.</li>
          </ul>
        </div>
      ),
    },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto mt-12">
      <div className="space-y-4">
        {docs.map((doc) => (
          <div key={doc.id} className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/50 backdrop-blur-sm">
            <button
              onClick={() => setOpenSection(openSection === doc.id ? null : doc.id)}
              className="w-full px-6 py-4 flex items-center justify-between text-left focus:outline-none"
            >
              <span className="font-semibold text-zinc-100">{doc.title}</span>
              <ChevronDown
                className={`w-5 h-5 text-zinc-400 transition-transform duration-300 ${openSection === doc.id ? 'rotate-180' : ''}`}
              />
            </button>
            <AnimatePresence>
              {openSection === doc.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="px-6 pb-6 pt-2 border-t border-zinc-800/50">
                    {doc.content}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-indigo-500/30 overflow-hidden relative">
      {/* Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-600/20 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20" />
      </div>

      {/* Navbar */}
      <nav className="relative z-50 border-b border-zinc-800/50 bg-zinc-950/50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="LoginLens" className="h-8 object-contain" />
          </div>
          <div className="flex items-center gap-6 text-sm font-medium">
            <a href="https://github.com/loginlens" className="text-zinc-400 hover:text-zinc-100 flex items-center gap-2 transition-colors">
              <Github className="w-4 h-4" />
              <span>GitHub</span>
            </a>
            <button className="bg-zinc-100 text-zinc-900 hover:bg-white px-4 py-2 rounded-full flex items-center gap-2 transition-colors">
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="pt-32 pb-20 px-6 text-center max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-sm font-medium mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            Open Source Chrome Extension · MV3
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-6xl md:text-8xl font-extrabold tracking-tight mb-8"
          >
            Your Identity Vault. <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Zero Servers.</span>
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Privacy-first OAuth tracking and credential management. Everything stays locally in your browser. No cloud sync, no tracking, pure control.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <button className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-semibold text-lg flex items-center justify-center gap-2 transition-all shadow-[0_0_30px_-5px_rgba(79,70,229,0.5)]">
              <Download className="w-5 h-5" />
              Install Extension
            </button>
            <button className="w-full sm:w-auto px-8 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 rounded-full font-semibold text-lg flex items-center justify-center gap-2 transition-all">
              <Github className="w-5 h-5" />
              View on GitHub
            </button>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="mt-20 relative mx-auto max-w-4xl"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent z-10 top-1/2" />
            <img 
              src="/banner.png" 
              alt="LoginLens Dashboard" 
              className="rounded-xl border border-zinc-800 shadow-2xl shadow-indigo-500/20 transform rotate-x-12 scale-105"
              style={{ transform: 'perspective(1000px) rotateX(5deg)' }}
            />
          </motion.div>

          <div className="flex flex-wrap items-center justify-center gap-4 mt-20 text-zinc-500 text-sm">
            <span>Works with:</span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full">Chrome</span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full">Edge</span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full">Firefox</span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full">Opera</span>
          </div>
        </section>

        {/* Social Proof Bar & GitHub Stats */}
        <div className="border-y border-zinc-800/50 bg-zinc-900/20 backdrop-blur-sm py-6">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex flex-wrap justify-center gap-6 md:gap-10 text-sm font-medium text-zinc-400">
              <span className="flex items-center gap-2"><Lock className="w-4 h-4 text-indigo-400" /> Zero external servers</span>
              <span className="flex items-center gap-2"><Database className="w-4 h-4 text-indigo-400" /> 100% Local Storage</span>
              <span className="flex items-center gap-2"><Code className="w-4 h-4 text-indigo-400" /> MV3 Manifest</span>
            </div>
            
            <div className="flex flex-wrap justify-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-sm">
                <Star className="w-4 h-4 text-yellow-500" /> <span className="font-bold text-zinc-200">Open</span> <span className="text-zinc-500">Source</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-sm">
                <GitMerge className="w-4 h-4 text-purple-400" /> <span className="font-bold text-zinc-200">Local</span> <span className="text-zinc-500">Vault</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-sm">
                <Scale className="w-4 h-4 text-blue-400" /> <span className="text-zinc-300">Apache 2.0</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-sm">
                <Download className="w-4 h-4 text-emerald-400" /> <span className="text-zinc-300">v1.0.0</span>
              </div>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <section className="py-24 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">How It Works</h2>
              <p className="text-zinc-400 text-lg">Three simple steps to secure your digital identity.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8 relative">
              <div className="hidden md:block absolute top-1/2 left-10 right-10 h-0.5 bg-gradient-to-r from-zinc-800 via-indigo-500/50 to-zinc-800 -z-10" />
              
              {[
                { step: 1, title: 'Install the extension', desc: 'Add LoginLens to Chrome or Edge in seconds.', icon: Download },
                { step: 2, title: 'Log in normally', desc: 'Sign in to any site via OAuth or standard login.', icon: Globe },
                { step: 3, title: 'Auto-recorded', desc: 'LoginLens maps and secures your identity automatically.', icon: Shield },
              ].map((item, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.5, delay: i * 0.2 }}
                  className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 p-8 rounded-2xl flex flex-col items-center text-center relative"
                >
                  <div className="w-16 h-16 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center mb-6 shadow-xl shadow-zinc-950">
                    <item.icon className="w-8 h-8 text-indigo-400" />
                  </div>
                  <div className="absolute -top-4 -right-4 w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-600/30">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                  <p className="text-zinc-400">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-24 px-6 bg-zinc-900/30 border-y border-zinc-800/30">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">Powerful Features</h2>
              <p className="text-zinc-400 text-lg">Everything you need to manage credentials securely.</p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { icon: Lock, title: 'Privacy-First Architecture', desc: 'All data stays in chrome.storage.local. No cloud sync, no tracking.' },
                { icon: Globe, title: 'Universal OAuth Recorder', desc: 'Pluggable handler system for any OAuth provider out of the box.' },
                { icon: Key, title: 'API Key Vault', desc: 'Click-to-reveal storage for sensitive API keys and developer secrets.' },
                { icon: Database, title: 'Identity Dashboard', desc: 'Full-page vault with fast search, filtering, and multi-select.' },
                { icon: FileKey, title: 'Source Tagging', desc: 'Imports from Edge, Chrome, Bitwarden with strict source provenance.' },
                { icon: Shield, title: 'MFA Tracking', desc: 'Track which authenticator app or hardware key secures each account.' },
              ].map((item, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="group bg-zinc-900/50 backdrop-blur-md border border-zinc-800 p-8 rounded-2xl hover:border-indigo-500/50 hover:bg-zinc-800/50 transition-all duration-300"
                >
                  <item.icon className="w-10 h-10 text-indigo-400 mb-6 group-hover:scale-110 transition-transform duration-300" />
                  <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                  <p className="text-zinc-400 leading-relaxed">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison Section */}
        <section className="py-24 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">Why LoginLens?</h2>
              <p className="text-zinc-400 text-lg">See how we compare to traditional password managers.</p>
            </div>
            
            <div className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-2 md:grid-cols-3 border-b border-zinc-800 bg-zinc-900/80 p-4 md:p-6 font-bold">
                <div className="col-span-1 md:col-span-1 text-zinc-400">Feature</div>
                <div className="text-center text-indigo-400">LoginLens</div>
                <div className="text-center text-zinc-500 hidden md:block">Bitwarden / 1Password / LastPass</div>
              </div>
              
              {[
                { label: '100% Local Storage', us: <Check className="w-5 h-5 text-emerald-400 mx-auto" />, them: 'Cloud storage' },
                { label: 'Zero Servers', us: <Check className="w-5 h-5 text-emerald-400 mx-auto" />, them: 'Monthly subscription' },
                { label: 'OAuth Tracking', us: <Check className="w-5 h-5 text-emerald-400 mx-auto" />, them: 'Only passwords' },
                { label: 'Source Tagging', us: <Check className="w-5 h-5 text-emerald-400 mx-auto" />, them: 'No provenance' },
                { label: 'Open Source', us: <Check className="w-5 h-5 text-emerald-400 mx-auto" />, them: <span className="flex items-center justify-center gap-1 text-yellow-400"><AlertTriangle className="w-4 h-4" /> Partial</span> },
                { label: 'Free Forever', us: <Check className="w-5 h-5 text-emerald-400 mx-auto" />, them: 'Premium features' },
              ].map((row, i) => (
                <div key={i} className="grid grid-cols-2 md:grid-cols-3 border-b border-zinc-800/50 p-4 md:p-6 items-center hover:bg-zinc-800/20 transition-colors">
                  <div className="font-medium">{row.label}</div>
                  <div className="text-center">{row.us}</div>
                  <div className="text-center text-zinc-500 text-sm hidden md:block">{typeof row.them === 'string' ? <span className="flex items-center justify-center gap-2"><X className="w-4 h-4 text-red-400/50" /> {row.them}</span> : row.them}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Demo / Features Showcase Section */}
        <section className="py-24 px-6 bg-zinc-900/30 border-y border-zinc-800/30 overflow-hidden">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">See It In Action</h2>
              <p className="text-zinc-400 text-lg">Designed for speed, clarity, and control.</p>
            </div>
            
            <div className="relative max-w-5xl mx-auto">
              {/* MacBook style frame */}
              <div className="rounded-t-2xl border-t border-l border-r border-zinc-700 bg-zinc-900 p-3 shadow-2xl flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                <div className="mx-auto bg-zinc-950 text-zinc-500 text-xs px-4 py-1 rounded-md border border-zinc-800 flex items-center gap-2">
                  <Lock className="w-3 h-3" /> chrome-extension://loginlens
                </div>
              </div>
              <div className="border border-zinc-700 bg-zinc-950 rounded-b-xl overflow-hidden relative">
                <img src="/banner.png" alt="App Interface" className="w-full opacity-90" />
                
                {/* Feature Callouts */}
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 }}
                  className="absolute top-[20%] left-[10%] bg-zinc-900/90 backdrop-blur border border-indigo-500/50 p-3 rounded-lg shadow-xl shadow-indigo-500/20 max-w-[200px]"
                >
                  <p className="text-sm font-semibold text-indigo-300 mb-1">OAuth Tracking</p>
                  <p className="text-xs text-zinc-400">Automatically links "Sign in with Google" to apps.</p>
                </motion.div>
                
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.6 }}
                  className="absolute bottom-[30%] right-[10%] bg-zinc-900/90 backdrop-blur border border-purple-500/50 p-3 rounded-lg shadow-xl shadow-purple-500/20 max-w-[200px]"
                >
                  <p className="text-sm font-semibold text-purple-300 mb-1">Source Provenance</p>
                  <p className="text-xs text-zinc-400">See exactly which app imported each password.</p>
                </motion.div>
              </div>
            </div>
          </div>
        </section>

        {/* Who is this for Section */}
        <section className="py-24 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">Who is LoginLens for?</h2>
              <p className="text-zinc-400 text-lg">Built for those who value privacy and control.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { icon: Code, title: 'Developers', desc: 'Securely manage API keys, track complex OAuth integrations, and keep local dev secrets safe.', color: 'text-blue-400', bg: 'bg-blue-400/10' },
                { icon: Users, title: 'Power Users', desc: 'Track which accounts use which OAuth provider, manage multiple identities effortlessly.', color: 'text-purple-400', bg: 'bg-purple-400/10' },
                { icon: Shield, title: 'Privacy Advocates', desc: 'Refuse cloud password managers. Keep 100% of your data offline with a strict zero-server architecture.', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
              ].map((persona, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2 }}
                  className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 p-8 rounded-2xl"
                >
                  <div className={`w-14 h-14 rounded-xl ${persona.bg} flex items-center justify-center mb-6`}>
                    <persona.icon className={`w-7 h-7 ${persona.color}`} />
                  </div>
                  <h3 className="text-2xl font-bold mb-3">{persona.title}</h3>
                  <p className="text-zinc-400 leading-relaxed">{persona.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Security Section */}
        <section className="py-24 px-6 text-center">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-5xl font-bold mb-12">Built on Trust</h2>
            <div className="flex flex-col md:flex-row justify-center gap-12">
              {[
                { icon: Eye, title: 'No Telemetry' },
                { icon: Zap, title: 'No Cloud Sync' },
                { icon: Github, title: 'Open Source Auditable' },
              ].map((item, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.2 }}
                  className="flex flex-col items-center"
                >
                  <div className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6 text-emerald-400">
                    <item.icon className="w-10 h-10" />
                  </div>
                  <h4 className="text-xl font-semibold">{item.title}</h4>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Documentation Section */}
        <section className="py-24 px-6 bg-zinc-900/30 border-y border-zinc-800/30">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">Documentation</h2>
              <p className="text-zinc-400 text-lg">Everything you need to know about using LoginLens.</p>
            </div>
            <DocsSection />
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-32 px-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/20 to-purple-900/20 z-0" />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="max-w-4xl mx-auto text-center relative z-10"
          >
            <h2 className="text-4xl md:text-6xl font-bold mb-8">Start tracking your logins today</h2>
            <p className="text-xl text-zinc-300 mb-10 max-w-2xl mx-auto">
              Take back control of your digital identity with the most secure, local-first credentials manager for Chrome.
            </p>
            <button className="px-10 py-5 bg-white text-black hover:bg-zinc-200 rounded-full font-bold text-lg flex items-center justify-center gap-3 transition-all mx-auto shadow-2xl shadow-white/10">
              <Download className="w-6 h-6" />
              Download for Chrome
            </button>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 bg-zinc-950 py-12 relative z-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="LoginLens" className="h-8 object-contain opacity-80" />
            <span className="font-semibold text-zinc-500">© 2025 LoginLens.</span>
          </div>
          <div className="flex flex-wrap items-center gap-6 md:gap-8 text-sm text-zinc-400">
            <a href="https://github.com/loginlens/releases" className="hover:text-zinc-100 transition-colors">Releases</a>
            <a href="https://github.com/loginlens/issues" className="hover:text-zinc-100 transition-colors">Report Bug</a>
            <a href="#" className="hover:text-zinc-100 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-zinc-100 transition-colors">Terms</a>
            <a href="https://github.com/loginlens" className="hover:text-zinc-100 transition-colors flex items-center gap-2">
              <Github className="w-4 h-4" />
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
