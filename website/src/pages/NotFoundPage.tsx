import React from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

/**
 * Every route is prerendered to its own `index.html`, so an unknown path is a
 * genuine 404 from the host rather than a route the client still has to
 * resolve. Static hosts that fall back to `index.html` land here instead of
 * showing a blank page.
 */
export const NotFoundPage: React.FC = () => (
  <main className="relative z-10 max-w-xl mx-auto px-6 py-28 text-center space-y-5">
    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-semibold">
      <Compass size={14} /> 404
    </div>
    <h1 className="text-4xl font-extrabold tracking-tight text-zinc-50">
      That page isn't here.
    </h1>
    <p className="text-zinc-400 text-sm leading-relaxed">
      The link may be out of date. Everything LoginLens has is one of the three
      below.
    </p>
    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
      <Link
        to="/"
        className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors"
      >
        Home
      </Link>
      <Link
        to="/docs"
        className="px-5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-zinc-100 font-bold text-xs transition-colors"
      >
        Documentation
      </Link>
      <Link
        to="/decrypt"
        className="px-5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-zinc-100 font-bold text-xs transition-colors"
      >
        In-Browser Decryptor
      </Link>
    </div>
  </main>
);
