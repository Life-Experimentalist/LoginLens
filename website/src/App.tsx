import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { 
  Github, 
  Download, 
  ShieldCheck, 
  Sun, 
  Moon, 
  Laptop, 
  Menu, 
  X 
} from 'lucide-react';
import { LandingPage } from './pages/LandingPage';
import { DecryptPage } from './pages/DecryptPage';
import { DocsPage } from './pages/DocsPage';
import { UninstallPage } from './pages/UninstallPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { useTheme } from './utils/theme';
import {
  EXTERNAL_LINK_PROPS,
  LICENSE_URL,
  PRIVACY_URL,
  RELEASES_URL,
  REPO_URL
} from './constants/links';

const Navbar: React.FC = () => {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const cycleTheme = () => {
    if (theme === 'system') setTheme('dark');
    else if (theme === 'dark') setTheme('light');
    else setTheme('system');
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        {/* Brand / Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="relative flex items-center gap-2">
            <img src="/icon.png" alt="LoginLens" className="h-9 w-9 object-contain drop-shadow-md" />
            <span className="font-extrabold text-lg text-zinc-100 tracking-tight">LoginLens</span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-zinc-400">
          <Link
            to="/"
            className={`transition-colors hover:text-zinc-100 ${location.pathname === '/' ? 'text-indigo-400 font-bold' : ''}`}
          >
            Home
          </Link>
          <Link
            to="/decrypt"
            className={`flex items-center gap-1.5 transition-colors hover:text-zinc-100 ${
              location.pathname === '/decrypt' ? 'text-indigo-400 font-bold' : ''
            }`}
          >
            <ShieldCheck size={16} className="text-indigo-400" />
            In-Browser Decryptor
          </Link>
          <Link
            to="/docs"
            className={`transition-colors hover:text-zinc-100 ${location.pathname === '/docs' ? 'text-indigo-400 font-bold' : ''}`}
          >
            Documentation
          </Link>
        </div>

        {/* Action Controls & Theme Toggle */}
        <div className="hidden md:flex items-center gap-4">
          <button
            onClick={cycleTheme}
            className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors flex items-center gap-1.5 text-xs font-semibold"
            title={`Theme: ${theme}`}
          >
            {theme === 'system' && <Laptop size={16} />}
            {theme === 'dark' && <Moon size={16} className="text-indigo-400" />}
            {theme === 'light' && <Sun size={16} className="text-amber-400" />}
            <span className="capitalize">{theme}</span>
          </button>

          <a
            href={REPO_URL}
            {...EXTERNAL_LINK_PROPS}
            className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            title="GitHub Repository"
          >
            <Github size={18} />
          </a>

          <a
            href={RELEASES_URL}
            {...EXTERNAL_LINK_PROPS}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all font-bold text-xs shadow-lg shadow-indigo-600/30"
          >
            <Download size={16} />
            <span>Install Extension</span>
          </a>
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="flex md:hidden items-center gap-3">
          <button
            onClick={cycleTheme}
            className="p-2 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400"
          >
            {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-100"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-zinc-800 bg-zinc-950 p-6 space-y-4">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block font-bold text-sm text-zinc-200"
          >
            Home
          </Link>
          <Link
            to="/decrypt"
            onClick={() => setMobileMenuOpen(false)}
            className="block font-bold text-sm text-indigo-400 flex items-center gap-2"
          >
            <ShieldCheck size={16} /> In-Browser Decryptor
          </Link>
          <Link
            to="/docs"
            onClick={() => setMobileMenuOpen(false)}
            className="block font-bold text-sm text-zinc-200"
          >
            Documentation
          </Link>
          <a
            href={RELEASES_URL}
            {...EXTERNAL_LINK_PROPS}
            className="block w-full text-center py-3 bg-indigo-600 text-white font-bold rounded-xl text-xs"
          >
            Install Extension
          </a>
        </div>
      )}
    </nav>
  );
};

/**
 * Everything below the router.
 *
 * Kept separate from the router itself so the build-time prerender can mount
 * the identical tree under a `StaticRouter` — the shell a crawler sees and the
 * shell the browser hydrates are then the same component, not two that have to
 * be kept in step by hand.
 */
export const AppShell: React.FC = () => {
  return (
    <>
      <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-indigo-500/30 overflow-x-hidden relative flex flex-col">
        {/* Dynamic Background Gradients */}
        <div className="fixed inset-0 z-0 pointer-events-none">
          <div className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/15 blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-600/15 blur-[120px]" />
        </div>

        <Navbar />

        <div className="flex-1 flex flex-col relative z-10 w-full">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/decrypt" element={<DecryptPage />} />
            <Route path="/docs" element={<DocsPage />} />
            {/* chrome.runtime.setUninstallURL points the browser here the
                moment the extension is removed. */}
            <Route path="/uninstall" element={<UninstallPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>

        {/* Comprehensive Footer */}
        <footer className="border-t border-zinc-800/80 bg-zinc-950 py-12 relative z-10 mt-auto">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <img src="/icon.png" alt="LoginLens" className="h-8 w-8" />
                <span className="font-extrabold text-base text-zinc-100">LoginLens</span>
              </div>
              <p className="text-zinc-400 text-xs max-w-sm leading-relaxed">
                Privacy-first, open-source OAuth tracking and local identity management. No account, no backend, no telemetry.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-zinc-100 mb-4 text-xs uppercase tracking-wider">Product & Tools</h4>
              <ul className="space-y-2 text-xs text-zinc-400 font-medium">
                <li><Link to="/decrypt" className="hover:text-indigo-400 transition-colors">In-Browser Decryptor</Link></li>
                <li><Link to="/docs" className="hover:text-indigo-400 transition-colors">Documentation</Link></li>
                <li><a href={RELEASES_URL} {...EXTERNAL_LINK_PROPS} className="hover:text-indigo-400 transition-colors">Releases</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-zinc-100 mb-4 text-xs uppercase tracking-wider">Legal & License</h4>
              <ul className="space-y-2 text-xs text-zinc-400 font-medium">
                <li><a href={LICENSE_URL} {...EXTERNAL_LINK_PROPS} className="hover:text-indigo-400 transition-colors">Apache 2.0 License</a></li>
                {/* This was plain text, so the one link a visitor is most
                    likely to want in a footer went nowhere. */}
                <li><a href={PRIVACY_URL} {...EXTERNAL_LINK_PROPS} className="hover:text-indigo-400 transition-colors">Privacy Policy</a></li>
              </ul>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-6 pt-8 border-t border-zinc-800/50 flex flex-col md:flex-row items-center justify-between gap-4 text-zinc-500 text-xs">
            <p>© {new Date().getFullYear()} LoginLens. Built for privacy.</p>
            <div className="flex gap-4">
              <a href={REPO_URL} {...EXTERNAL_LINK_PROPS} aria-label="LoginLens on GitHub" className="hover:text-zinc-300 transition-colors">
                <Github className="w-4 h-4" />
              </a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

const App: React.FC = () => (
  <BrowserRouter>
    <AppShell />
  </BrowserRouter>
);

export default App;
