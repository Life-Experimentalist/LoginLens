import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Lock, 
  Database, 
  Code, 
  Download, 
  Star, 
  GitMerge, 
  Scale, 
  ChevronDown,
  Key, 
  Globe, 
  AlertTriangle,
  Layers,
  Sparkles,
  ShieldCheck,
  Fingerprint,
  CheckCircle2,
  XCircle,
  MousePointerClick,
  CloudOff,
  HardDrive,
  Puzzle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ExtensionDetector } from '../components/ExtensionDetector';
import { EXTERNAL_LINK_PROPS, RELEASES_URL } from '../constants/links';

interface DemoAccountItem {
  username: string;
  method: string;
  provider?: string;
  scope?: string;
  mfa?: string;
  reuse?: boolean;
}

interface DemoDomain {
  domain: string;
  label: string;
  type: string;
  accounts: DemoAccountItem[];
}

export const LandingPage: React.FC = () => {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  // Interactive Live Demo Simulator State
  const [selectedDemoDomain, setSelectedDemoDomain] = useState<string>('example.com');
  const [demoAccounts] = useState<DemoDomain[]>([
    {
      domain: 'example.com',
      label: 'Personal & Work Logins',
      type: 'website',
      accounts: [
        { username: 'user@example.com', method: 'password', mfa: 'Google Authenticator', reuse: false },
        { username: 'admin@example.org', method: 'password', mfa: 'YubiKey 5C', reuse: true },
        { username: 'dev_token_user', method: 'oauth', provider: 'github.com', reuse: false }
      ]
    },
    {
      domain: 'github.com',
      label: 'Developer Identity Hub',
      type: 'website',
      accounts: [
        { username: 'life-experimentalist', method: 'oauth', provider: 'github.com', reuse: false },
        { username: 'ghp_prod_key_2026', method: 'api-key', scope: 'Read/Write Repo', reuse: false }
      ]
    },
    {
      domain: 'accounts.google.com',
      label: 'OAuth Master Provider',
      type: 'website',
      accounts: [
        { username: 'developer@gmail.com', method: 'oauth', provider: 'google.com', reuse: false }
      ]
    }
  ]);

  const activeDemo = demoAccounts.find((d) => d.domain === selectedDemoDomain) || demoAccounts[0];

  const faqs = [
    {
      q: 'Does LoginLens store my passwords or send data to external servers?',
      a: 'It does not store passwords at all — only a keyed fingerprint used to spot reuse, which cannot be reversed back into the password. There is no account, no backend of ours and no telemetry, so nothing is ever sent to us. Exactly two things can leave your device, and both stay off until you switch them on: fetching a site favicon from Google, and cross-device sync, which rides your browser\'s own sync and is encrypted with your passphrase before it is uploaded.'
    },
    {
      q: 'How does the Universal OAuth Tracker work?',
      a: 'LoginLens observes OAuth redirect parameters (such as "Sign in with Google" or GitHub auth callbacks) seamlessly in background service workers, mapping which third-party sites are authorized by your identities.'
    },
    {
      q: 'What is Same-Site Alias Resolution?',
      a: 'When you have multiple accounts on the exact same domain (e.g. user_1 and user_2@example.org), LoginLens groups them logically into single domain cards, allowing you to link or mark them as distinct with 1-click.'
    },
    {
      q: 'How do I open an encrypted backup if I no longer have the extension?',
      a: "Use the In-Browser Recovery Tool on this site. Open your encrypted .LLBAK file, enter the passphrase you chose when exporting it, and it is decrypted in this page's memory. The file is never uploaded — the page keeps working with your network disconnected, which is the easiest way to verify that."
    },
    {
      q: 'Is LoginLens open source?',
      a: 'Yes, LoginLens is fully open source under the permissive Apache 2.0 License. You can audit the code, fork it, or build it yourself directly from GitHub.'
    },
    {
      q: 'Is this a replacement for my password manager?',
      a: 'No, and it is not trying to be. A password manager holds your passwords and fills them in. LoginLens holds the map: which accounts exist, on which sites, under which identity, signing in by which method. Keep using 1Password or Bitwarden for the secrets — LoginLens answers the questions they do not, like "which forty sites break if I lose this Google account?"'
    },
    {
      q: 'What permissions does it ask for, and why?',
      a: 'Four: storage, to keep the vault on your device; tabs, to know which site the popup is being opened on; clipboardWrite, for the copy buttons; and alarms, because a Manifest V3 service worker is shut down when idle and an alarm is the only timer that survives that. It requests no host permissions at all. The full reasoning, permission by permission, is in PERMISSIONS.md in the repository.'
    },
    {
      q: 'What happens to my data if I uninstall it?',
      a: 'It goes with the extension — the browser deletes everything LoginLens stored on that device. The one exception is encrypted browser sync if you enabled it, since that copy has already replicated to your other signed-in browsers. Before you uninstall, Settings → Data → Export & Leave lets you take an encrypted backup and delete the synced copy everywhere.'
    },
    {
      q: 'Which browsers does it run on?',
      a: 'Chrome, Edge, Brave, Opera and other Chromium browsers via the Manifest V3 build, and Firefox via both MV2 and MV3 builds. A Safari build is produced too. Every target is built from the same source in CI.'
    }
  ];

  // Emitted into the prerendered HTML, so search engines can read the answers
  // as structured data rather than having to expand accordions they cannot
  // click. Built from the same `faqs` array the page renders — there is no
  // second copy to fall out of sync.
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  };

  return (
    <main className="relative z-10 w-full flex flex-col items-center overflow-hidden">
      {/* `<` is escaped because a `</script>` appearing inside any answer would
          otherwise close this block early. The answers are literals in this
          file today, but that is a property of the current copy rather than a
          guarantee about the next edit. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqSchema).replace(/</g, '\\u003c')
        }}
      />

      {/* Hero Section */}
      <section className="pt-24 pb-20 px-6 text-center w-full max-w-6xl mx-auto flex flex-col items-center relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-semibold mb-8 shadow-inner"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping" />
          <span>Open Source Manifest V3 Browser Extension</span>
        </motion.div>

        <div className="flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-16 w-full mb-12">
          {/* Headline and text */}
          <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left z-10">
            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1] text-zinc-50"
            >
              Your Identity Vault. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
                No Backend.
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg md:text-xl text-zinc-400 max-w-lg mb-10 leading-relaxed font-normal"
            >
              Privacy-first OAuth tracking, Same-Site identity resolution, and local credential management. It all runs in your browser — no account, no backend.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center gap-4 w-full"
            >
              <a
                href={RELEASES_URL}
                {...EXTERNAL_LINK_PROPS}
                className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all shadow-[0_0_30px_-5px_rgba(79,70,229,0.5)] hover:scale-[1.02]"
              >
                <Download className="w-5 h-5" />
                Install Extension
              </a>
              <Link
                to="/decrypt"
                className="w-full sm:w-auto px-8 py-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-zinc-800 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
              >
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                In-Browser Recovery Tool
              </Link>
            </motion.div>
          </div>

          {/* Interactive Graphical Showcase */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative shrink-0 flex-1 flex justify-center items-center max-w-md w-full"
          >
            <div className="absolute inset-0 rounded-[3rem] bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-pink-500/20 blur-3xl pointer-events-none" />
            <div className="relative w-full p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800/80 shadow-2xl backdrop-blur-2xl">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                  <span className="text-xs font-mono text-zinc-500 ml-2">LoginLens Vault v1.0</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[10px] font-bold border border-indigo-500/20">
                  LOCAL VAULT
                </span>
              </div>

              <div className="space-y-3 text-left">
                <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/60 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Globe size={18} className="text-indigo-400" />
                    <div>
                      <p className="text-xs font-bold text-zinc-100">example.com</p>
                      <p className="text-[10px] text-zinc-500">3 Saved Identities</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold">
                    1-Click Linked
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/60 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <GitMerge size={18} className="text-purple-400" />
                    <div>
                      <p className="text-xs font-bold text-zinc-100">github.com</p>
                      <p className="text-[10px] text-zinc-500">OAuth & API Key Registry</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px] font-semibold">
                    OAuth Active
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Social Proof Bar */}
      <div className="w-full border-y border-zinc-800/50 bg-zinc-900/40 backdrop-blur-xl py-6">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-wrap justify-center gap-6 md:gap-10 text-sm font-medium text-zinc-400">
            <span className="flex items-center gap-2"><Lock className="w-4 h-4 text-indigo-400" /> No Backend, No Telemetry</span>
            <span className="flex items-center gap-2"><Database className="w-4 h-4 text-indigo-400" /> Local-First Storage</span>
            <span className="flex items-center gap-2"><Code className="w-4 h-4 text-indigo-400" /> MV3 Manifest</span>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs">
              <Star className="w-4 h-4 text-yellow-500" /> <span className="font-bold text-zinc-200">Open Source</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs">
              <Scale className="w-4 h-4 text-blue-400" /> <span className="text-zinc-300">Apache 2.0</span>
            </div>
          </div>
        </div>
      </div>

      {/* Extension Detection & Multi-Browser Download Showcase */}
      <ExtensionDetector />

      {/* Interactive Live Vault Demo Simulator */}
      <section className="py-20 px-6 w-full max-w-6xl mx-auto text-center">
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold mb-4">
            <Sparkles size={14} /> Live Interactive Preview
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold text-zinc-50 tracking-tight mb-4">
            Experience the Vault Interface
          </h2>
          <p className="text-zinc-400 text-sm md:text-base max-w-xl mx-auto">
            Click across the simulated domains below to see how LoginLens categorizes website accounts, OAuth providers, and API keys.
          </p>
        </div>

        {/* Live Simulator Card */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 md:p-8 text-left shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3 overflow-x-auto pb-4 mb-6 border-b border-zinc-800">
            {demoAccounts.map((d) => (
              <button
                key={d.domain}
                onClick={() => setSelectedDemoDomain(d.domain)}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shrink-0 ${
                  selectedDemoDomain === d.domain
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'bg-zinc-950 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-800'
                }`}
              >
                <Globe size={14} />
                {d.domain}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-100">{activeDemo.label}</h3>
                <p className="text-xs text-zinc-500">{activeDemo.domain}</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-semibold">
                {activeDemo.accounts.length} Accounts Saved
              </span>
            </div>

            <div className="grid gap-3">
              {activeDemo.accounts.map((acc, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-between flex-wrap gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-indigo-400">
                      {acc.method === 'password' && <Key size={18} />}
                      {acc.method === 'oauth' && <GitMerge size={18} />}
                      {acc.method === 'api-key' && <Code size={18} />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-200">{acc.username}</p>
                      <p className="text-xs text-zinc-500">
                        Method: <span className="text-zinc-400 uppercase font-semibold">{acc.method}</span>
                        {acc.provider && ` · Provider: ${acc.provider}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {acc.mfa && (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                        MFA: {acc.mfa}
                      </span>
                    )}
                    {acc.reuse && (
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold flex items-center gap-1">
                        <AlertTriangle size={12} /> Password Reused
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="py-20 px-6 w-full max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-extrabold mb-4 text-zinc-50 tracking-tight">
            Designed for Modern Identity Tracking
          </h2>
          <p className="text-zinc-400 text-base md:text-lg max-w-lg mx-auto">
            Everything you need to organize passwords, OAuth flows, and MFA without cloud lock-in.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: <GitMerge className="w-6 h-6 text-indigo-400" />,
              title: 'Universal OAuth Tracker',
              desc: 'Automatically records "Sign in with Google" or GitHub auth callbacks in service workers without manual typing.'
            },
            {
              icon: <Lock className="w-6 h-6 text-purple-400" />,
              title: 'Zero-Server Architecture',
              desc: 'Everything lives in your browser\'s own storage. No account, no backend of ours, no telemetry. The two things that can go outbound — a favicon fetch and encrypted cross-device sync — are both off until you turn them on.'
            },
            {
              icon: <Layers className="w-6 h-6 text-emerald-400" />,
              title: 'Same-Site Alias Resolver',
              desc: 'Consolidates multiple accounts on the same domain into clean cards with 1-click same-site alias resolution.'
            },
            {
              icon: <ShieldCheck className="w-6 h-6 text-blue-400" />,
              title: 'In-Browser Decryptor',
              desc: 'Recover encrypted backups directly in your browser without needing Python scripts or third-party software.'
            },
            {
              icon: <AlertTriangle className="w-6 h-6 text-amber-400" />,
              title: 'Password Reuse Alerts',
              desc: 'Each password becomes a keyed HMAC-SHA256 fingerprint, using a key generated on your machine that never leaves it. Reuse across sites is detected by comparing fingerprints; the password itself is never stored.'
            },
            {
              icon: <Code className="w-6 h-6 text-pink-400" />,
              title: 'API & Token Registry',
              desc: 'Store and tag API tokens, secret keys, and developer credentials with scopes and environment labels.'
            }
          ].map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="p-8 rounded-3xl bg-zinc-900/50 border border-zinc-800/80 hover:border-indigo-500/50 transition-colors backdrop-blur-xl"
            >
              <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 flex items-center justify-center mb-6">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold mb-3 text-zinc-100">{feature.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works — the question every visitor has before any feature list
          means anything: what do I actually have to do? */}
      <section className="py-20 px-6 w-full max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold mb-4">
            <MousePointerClick size={14} /> Three steps, then it gets out of the way
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold text-zinc-50 tracking-tight mb-4">
            How LoginLens works
          </h2>
          <p className="text-zinc-400 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            There is no sign-up, no onboarding wizard and no server to wait on.
            You install it and it starts noticing things.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              step: '01',
              icon: <Puzzle className="w-6 h-6 text-indigo-400" />,
              title: 'Install it',
              desc: 'Load the build for your browser. Nothing to create, nothing to log into — the vault exists the moment the extension does.'
            },
            {
              step: '02',
              icon: <Globe className="w-6 h-6 text-purple-400" />,
              title: 'Keep browsing',
              desc: 'When you sign in somewhere, LoginLens notices the account and how you got in — password, a "Sign in with Google" redirect, an API token — and offers to remember it. You confirm; it never saves silently.'
            },
            {
              step: '03',
              icon: <Layers className="w-6 h-6 text-emerald-400" />,
              title: 'See the whole map',
              desc: 'Open the vault to find every account grouped by site, which identity each one belongs to, which sites depend on one OAuth provider, and where a password has been reused.'
            }
          ].map((s, i) => (
            <motion.div
              key={s.step}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.45, delay: i * 0.1 }}
              className="relative p-8 rounded-3xl bg-zinc-900/50 border border-zinc-800/80 backdrop-blur-xl overflow-hidden"
            >
              <span className="absolute top-5 right-6 text-5xl font-extrabold text-zinc-800/70 select-none">
                {s.step}
              </span>
              <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 flex items-center justify-center mb-6 relative">
                {s.icon}
              </div>
              <h3 className="text-xl font-bold mb-3 text-zinc-100 relative">{s.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed relative">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* What is stored and what is not. A privacy claim nobody can check is
          just marketing, so this is the specific list. */}
      <section className="py-20 px-6 w-full max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold mb-4">
            <Fingerprint size={14} /> The specifics, not the slogan
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold text-zinc-50 tracking-tight mb-4">
            What it keeps. What it never sees.
          </h2>
          <p className="text-zinc-400 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            "Private" is easy to say. Here is the actual contents of the vault,
            and the things that are deliberately not in it.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.45 }}
            className="p-8 rounded-3xl bg-zinc-900/50 border border-zinc-800/80 backdrop-blur-xl"
          >
            <div className="flex items-center gap-3 mb-6">
              <HardDrive className="w-5 h-5 text-emerald-400" />
              <h3 className="text-lg font-bold text-zinc-100">Stored on your device</h3>
            </div>
            <ul className="space-y-3.5">
              {[
                'The sites you have accounts on, and the usernames on each',
                'How you sign in to each one: password, OAuth provider, passkey, API token',
                'Which authenticator app or key covers which account',
                'A keyed fingerprint per password — enough to spot reuse, not enough to recover the password',
                'Your own notes, tags and links between accounts'
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-zinc-400 leading-relaxed">
                  <CheckCircle2 size={17} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="p-8 rounded-3xl bg-zinc-900/50 border border-zinc-800/80 backdrop-blur-xl"
          >
            <div className="flex items-center gap-3 mb-6">
              <CloudOff className="w-5 h-5 text-red-400" />
              <h3 className="text-lg font-bold text-zinc-100">Never stored, never sent</h3>
            </div>
            <ul className="space-y-3.5">
              {[
                'Your passwords — LoginLens is not a password manager and has nowhere to put one',
                'TOTP secrets or anything that could generate your 2FA codes',
                'Session cookies, tokens or anything that could sign in as you',
                'Analytics, crash reports, usage pings, install counts',
                'Anything at all on a server we run, because there is no server we run'
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-zinc-400 leading-relaxed">
                  <XCircle size={17} className="text-red-400/80 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: 0.15 }}
          className="mt-6 p-6 rounded-3xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col md:flex-row md:items-center gap-4 justify-between"
        >
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
              Optional encrypted sync exists for people who want their vault on
              more than one machine. It is off until you turn it on, it uses
              your browser's own sync rather than anything of ours, and it is
              encrypted with a passphrase before it leaves the device.
            </p>
          </div>
          <Link
            to="/docs"
            className="shrink-0 px-5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 font-bold text-xs transition-colors text-center"
          >
            Read the full privacy breakdown
          </Link>
        </motion.div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 px-6 w-full max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-extrabold mb-4 text-zinc-50 tracking-tight">
            Frequently Asked Questions
          </h2>
          <p className="text-zinc-400 text-sm md:text-base">Everything you need to know about LoginLens security and privacy.</p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, idx) => (
            <div
              key={idx}
              className="border border-zinc-800 rounded-2xl bg-zinc-900/60 overflow-hidden backdrop-blur-xl"
            >
              <button
                onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                className="w-full p-6 text-left font-bold text-sm md:text-base text-zinc-100 flex items-center justify-between gap-4"
              >
                <span>{faq.q}</span>
                <ChevronDown
                  size={18}
                  className={`text-zinc-400 transition-transform duration-300 ${
                    activeFaq === idx ? 'rotate-180 text-indigo-400' : ''
                  }`}
                />
              </button>
              <AnimatePresence>
                {activeFaq === idx && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-6 pb-6 text-xs md:text-sm text-zinc-400 leading-relaxed border-t border-zinc-800/50 pt-4"
                  >
                    {faq.a}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="py-20 px-6 w-full max-w-5xl mx-auto text-center">
        <div className="p-10 md:p-16 rounded-3xl bg-gradient-to-br from-indigo-900/40 via-purple-900/20 to-zinc-900 border border-indigo-500/30 relative overflow-hidden shadow-2xl backdrop-blur-2xl">
          <h2 className="text-3xl md:text-5xl font-extrabold text-zinc-50 mb-6 tracking-tight">
            Take Control of Your Identity
          </h2>
          <p className="text-zinc-300 text-sm md:text-base max-w-lg mx-auto mb-8 leading-relaxed">
            Install LoginLens for Chrome, Firefox, or Edge today. No account, no backend, no telemetry.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={RELEASES_URL}
              {...EXTERNAL_LINK_PROPS}
              className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl text-base transition-all shadow-xl shadow-indigo-600/30"
            >
              Get LoginLens Now
            </a>
            <Link
              to="/docs"
              className="px-8 py-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 font-bold rounded-2xl text-base transition-all"
            >
              Read Documentation
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
};
