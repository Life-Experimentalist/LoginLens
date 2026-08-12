import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Heart,
  CloudOff,
  ShieldCheck,
  Download,
  MessageSquare,
  Trash2,
  ArrowRight
} from 'lucide-react';
import {
  EXTERNAL_LINK_PROPS,
  NEW_ISSUE_URL,
  PRIVACY_URL,
  RELEASES_URL
} from '../constants/links';

/**
 * The page the browser opens once LoginLens has already been removed.
 *
 * By the time anyone reads this the extension is gone, so nothing here can
 * touch the vault — the in-extension farewell screen (Settings → Data →
 * Export & Leave) is the one that can, and it is the one that offers a backup. This
 * page's job is the part that outlives the uninstall: the synced copy on the
 * user's other devices, which removing the extension here does not reach.
 */
export const UninstallPage: React.FC = () => {
  return (
    <main className="relative z-10 max-w-3xl mx-auto px-6 py-20 md:py-28">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center space-y-5"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-semibold">
          <Heart size={14} className="text-red-400" />
          LoginLens has been removed
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-zinc-50">
          Take care.
        </h1>
        {/* Do not widen this to "there was never a copy anywhere else" — the
            very next section explains that encrypted browser sync is exactly
            such a copy. The true claim is about us, not about the data. */}
        <p className="text-zinc-400 text-base leading-relaxed max-w-xl mx-auto">
          Everything LoginLens stored on this device went with it. There was
          never an account, a server of ours, or any analytics — nothing was
          ever sent to us, so we genuinely do not know you were here.
        </p>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mt-12 p-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-left space-y-4"
      >
        <div className="flex items-start gap-3">
          <CloudOff size={20} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h2 className="font-bold text-amber-200 text-sm">
              One thing an uninstall does not reach
            </h2>
            <p className="text-xs text-amber-100/80 leading-relaxed">
              If you had turned on encrypted browser sync, that copy already
              replicated to your other signed-in browsers. Removing LoginLens
              here does not delete it there. It stays encrypted with your
              passphrase and is unreadable without it, but if you want it gone:
            </p>
          </div>
        </div>
        <ol className="space-y-2 text-xs text-amber-100/80 leading-relaxed list-decimal pl-5">
          <li>
            Open a browser still signed in to the same profile, where LoginLens
            is still installed.
          </li>
          <li>
            Go to <span className="font-semibold text-amber-200">Settings → Data → Export &amp; Leave</span> and
            choose <span className="font-semibold text-amber-200">Delete the synced copy everywhere</span>.
          </li>
          <li>Then remove the extension from that browser too.</li>
        </ol>
        <p className="text-[11px] text-amber-100/60 leading-relaxed flex items-start gap-2">
          <Trash2 size={13} className="shrink-0 mt-0.5" />
          Never enabled sync? Then there is nothing left anywhere and you can
          close this tab.
        </p>
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        <a
          href={NEW_ISSUE_URL}
          {...EXTERNAL_LINK_PROPS}
          className="group p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-indigo-500/50 transition-colors text-left"
        >
          <MessageSquare size={18} className="text-indigo-400 mb-3" />
          <h3 className="font-bold text-sm text-zinc-100 mb-1.5 flex items-center gap-1.5">
            Tell us what went wrong
            <ArrowRight
              size={14}
              className="opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
            />
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            There is no feedback form that phones home, so a GitHub issue is the
            only way we hear anything. It is read.
          </p>
        </a>

        <a
          href={RELEASES_URL}
          {...EXTERNAL_LINK_PROPS}
          className="group p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-indigo-500/50 transition-colors text-left"
        >
          <Download size={18} className="text-indigo-400 mb-3" />
          <h3 className="font-bold text-sm text-zinc-100 mb-1.5 flex items-center gap-1.5">
            Changed your mind
            <ArrowRight
              size={14}
              className="opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
            />
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Reinstall, then restore the <code className="text-indigo-400">.LLBAK</code>{' '}
            backup you exported from Settings → Data.
          </p>
        </a>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 text-xs text-zinc-500"
      >
        <a
          href={PRIVACY_URL}
          {...EXTERNAL_LINK_PROPS}
          className="inline-flex items-center gap-1.5 hover:text-zinc-300 transition-colors"
        >
          <ShieldCheck size={14} /> What was stored, and where
        </a>
        <span className="hidden sm:inline text-zinc-700">·</span>
        <Link to="/" className="hover:text-zinc-300 transition-colors">
          Back to the homepage
        </Link>
      </motion.div>
    </main>
  );
};
