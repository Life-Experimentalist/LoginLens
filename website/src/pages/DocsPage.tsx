import React, { useState } from 'react';
import { 
  Shield, 
  ChevronRight, 
  Layers,
  FileCode,
  Compass,
  BookOpen,
  Zap,
  Database,
  Lock,
  Search,
  CheckCircle,
  FileSpreadsheet
} from 'lucide-react';
import { MermaidRenderer } from '../components/MermaidRenderer';

const DOCS_SECTIONS = [
  {
    id: 'architecture',
    title: 'Zero-Server Architecture',
    icon: <Shield className="w-5 h-5" />,
    shortSummary: 'Runs entirely in your browser. No backend, no telemetry — and the two things that can go outbound are both opt-in.',
    content: (viewMode: 'short' | 'long') => (
      <div className="space-y-8">
        <div>
          <span className="px-3.5 py-1.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold uppercase tracking-wider">
            Core Security Architecture
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold text-zinc-100 mt-3 mb-3">
            Zero-Server Security & Local Storage Model
          </h2>
          <p className="text-zinc-300 text-base md:text-lg leading-relaxed">
            LoginLens operates on a strict zero-server paradigm. All data operations, identity inferences, and cryptographic routines take place entirely inside your browser's local sandbox.
          </p>
        </div>

        {viewMode === 'short' ? (
          <div className="p-8 rounded-3xl bg-indigo-950/40 border border-indigo-500/30 space-y-4">
            <h3 className="text-base font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-2">
              <Zap size={18} className="text-indigo-400" /> Executive Summary (Short Version)
            </h3>
            <ul className="list-disc pl-6 text-sm text-zinc-300 space-y-3 leading-relaxed">
              <li><strong>Zero External APIs:</strong> LoginLens has no analytics, telemetry, or remote server endpoints.</li>
              <li><strong>Local Storage Isolation:</strong> Credentials and OAuth links are stored exclusively in <code className="text-indigo-400 font-mono">chrome.storage.local</code>.</li>
              <li><strong>In-Memory Crypto:</strong> Vault decryption and Web Crypto API routines execute strictly within local browser RAM.</li>
            </ul>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="space-y-4">
              <h3 className="text-lg md:text-xl font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                <Layers size={18} className="text-indigo-400" /> System Architecture Flow Diagram
              </h3>
              <MermaidRenderer
                chart={`
graph TD
    A["🌐 Web Page / User Login"] -->|Captures Credentials & OAuth Callback| B["🛡️ Content Script (injector.tsx)"]
    B -->|Isolated World IPC| C["⚡ Service Worker (background/index.ts)"]
    C -->|Local Native Storage| D["💾 chrome.storage.local Sandbox"]
    D -->|Renders Visual Vault| E["📱 Extension Popup & Vault Dashboard"]
    
    style A fill:#18181b,stroke:#3f3f46,color:#f4f4f5
    style B fill:#312e81,stroke:#6366f1,color:#f4f4f5
    style C fill:#4c1d95,stroke:#8b5cf6,color:#f4f4f5
    style D fill:#064e3b,stroke:#10b981,color:#f4f4f5
    style E fill:#18181b,stroke:#6366f1,color:#f4f4f5
                `}
              />
            </div>

            <div className="p-8 bg-zinc-950/80 border border-zinc-800 rounded-3xl space-y-6">
              <h4 className="text-base md:text-lg font-extrabold uppercase tracking-wider text-indigo-400">
                Detailed Element Breakdown & Component Specifications
              </h4>

              <div className="grid gap-5 text-sm">
                <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                  <strong className="text-zinc-100 text-base block">1. 🌐 Web Page / User Login</strong>
                  <p className="text-zinc-400 leading-relaxed">
                    The active web page where credentials or OAuth redirect callbacks are submitted. LoginLens monitors password form fields and OAuth response headers without capturing plaintext data over network channels.
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                  <strong className="text-indigo-300 text-base block">2. 🛡️ Content Script (injector.tsx)</strong>
                  <p className="text-zinc-400 leading-relaxed">
                    Executes at <code className="text-indigo-400 font-mono">document_start</code> inside Chrome's isolated JS execution context. Injects main-world detection markers and monitors identity inputs.
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                  <strong className="text-purple-300 text-base block">3. ⚡ Background Service Worker</strong>
                  <p className="text-zinc-400 leading-relaxed">
                    The central background process in Manifest V3. Monitors web request headers for OAuth redirect callbacks (e.g., Google/GitHub) and manages intra-extension IPC.
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                  <strong className="text-emerald-300 text-base block">4. 💾 chrome.storage.local Sandbox</strong>
                  <p className="text-zinc-400 leading-relaxed">
                    Chrome's sandboxed local disk storage. Stores <code className="text-emerald-400 font-mono">saved_accounts</code>, <code className="text-emerald-400 font-mono">oauth_registry</code>, and <code className="text-emerald-400 font-mono">mfa_registry</code>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  },
  {
    id: 'aliasing',
    title: 'OAuth & Domain Aliasing Engine',
    icon: <Database className="w-5 h-5" />,
    shortSummary: 'Exact subdomain isolation, eTLD+1 matching, and reverse-DNS app package resolution.',
    content: (viewMode: 'short' | 'long') => (
      <div className="space-y-8">
        <div>
          <span className="px-3.5 py-1.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-bold uppercase tracking-wider">
            Identity Resolution
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold text-zinc-100 mt-3 mb-3">
            OAuth & Domain Aliasing Engine
          </h2>
          <p className="text-zinc-300 text-base md:text-lg leading-relaxed">
            LoginLens uses precision domain matching algorithms (<code className="text-purple-400 font-mono">src/core/utils/domain.ts</code>) to isolate shared hosting subdomains while grouping OAuth providers and same-site identities.
          </p>
        </div>

        {viewMode === 'short' ? (
          <div className="p-8 rounded-3xl bg-purple-950/40 border border-purple-500/30 text-sm text-zinc-300 space-y-4">
            <h3 className="text-base font-bold text-purple-300 uppercase tracking-wider flex items-center gap-2">
              <Zap size={18} /> Domain Aliasing Key Principles
            </h3>
            <ul className="list-disc pl-6 space-y-2.5 leading-relaxed">
              <li><strong>Subdomain Isolation:</strong> <code className="text-purple-300 font-mono">user1.github.io</code> is isolated from <code className="text-purple-300 font-mono">user2.github.io</code>.</li>
              <li><strong>Same-Site Alias Grouping:</strong> Opt-in alias maps group logins across related portals (e.g. <code className="text-purple-300 font-mono">dash.cloudflare.com</code> and <code className="text-purple-300 font-mono">cloudflare.com</code>).</li>
              <li><strong>Mobile App Package Resolution:</strong> Supports reverse-DNS package namespaces (e.g. <code className="text-purple-300 font-mono">com.google.android.apps</code>).</li>
            </ul>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="space-y-4">
              <h3 className="text-lg md:text-xl font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                <Database size={18} className="text-purple-400" /> OAuth Resolution Sequence
              </h3>
              <MermaidRenderer
                chart={`
sequenceDiagram
    autonumber
    actor User
    participant Page as Web Page (OAuth Button)
    participant Extension as LoginLens Content Script
    participant Worker as Background Worker
    participant Vault as Local Vault Storage

    User->>Page: Clicks "Sign in with Google"
    Page->>Extension: Initiates OAuth Redirect (accounts.google.com)
    Extension->>Worker: Intercepts OAuth Provider Response
    Worker->>Worker: Resolves Domain & Email Metadata
    Worker->>Vault: Stores Linked OAuth Account Record
    Vault-->>User: Renders OAuth Badge in Vault Dashboard
                `}
              />
            </div>

            <div className="p-8 bg-zinc-950 border border-zinc-800 rounded-3xl space-y-6">
              <h4 className="text-sm font-extrabold uppercase tracking-wider text-purple-400">
                Subdomain & Reverse-DNS Parsing Rules
              </h4>
              <div className="grid gap-4 text-sm text-zinc-300">
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <strong className="text-zinc-100 font-bold block mb-1">1. Exact Subdomain Isolation</strong>
                  <p className="text-zinc-400">Prevents credential leakage on shared hosts like Cloudflare Workers (<code className="text-purple-400 font-mono">app.workers.dev</code>), Netlify, or GitHub Pages.</p>
                </div>
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <strong className="text-zinc-100 font-bold block mb-1">2. Mobile App Package Namespaces</strong>
                  <p className="text-zinc-400">Recognizes mobile imports such as <code className="text-purple-400 font-mono">org.signal.android</code> or <code className="text-purple-400 font-mono">com.spotify.music</code> without altering reverse-DNS formatting.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  },
  {
    id: 'crypto',
    title: 'Cryptographic Envelope Specification',
    icon: <Lock className="w-5 h-5" />,
    shortSummary: 'PBKDF2-HMAC-SHA256 key derivation at 600,000 iterations, AES-256-GCM, and a documented backup envelope.',
    content: (viewMode: 'short' | 'long') => (
      <div className="space-y-8">
        <div>
          <span className="px-3.5 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold uppercase tracking-wider">
            Cryptography Reference
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold text-zinc-100 mt-3 mb-3">
            Cryptographic Envelope Specification
          </h2>
          <p className="text-zinc-300 text-base md:text-lg leading-relaxed">
            LoginLens uses the native Web Crypto API (<code className="text-emerald-400 font-mono">crypto.subtle</code>) to encrypt <code className="text-emerald-400 font-mono">.llbak</code> backups and cloud-sync payloads before they leave the device. Local snapshots are not encrypted — they sit in your browser profile alongside the vault they snapshot.
          </p>
        </div>

        {viewMode === 'short' ? (
          <div className="p-8 rounded-3xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-300 space-y-3">
            <h3 className="text-base font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
              <Zap size={18} /> Crypto Specifications
            </h3>
            <ul className="list-disc pl-6 space-y-2 leading-relaxed">
              <li><strong>Key Derivation:</strong> PBKDF2-HMAC-SHA256, 600,000 iterations, 16-byte random salt per payload.</li>
              <li><strong>Cipher Algorithm:</strong> AES-GCM 256-bit with a 96-bit Initialization Vector (IV) and 128-bit auth tag.</li>
              <li><strong>Export File Format:</strong> <code className="text-emerald-400 font-mono">loginlens_vault_YYYY-MM-DD.llbak</code> — JSON metadata wrapping one base64 envelope.</li>
              <li><strong>Reuse Fingerprints:</strong> keyed HMAC-SHA256, under a 256-bit key generated per install and never exported.</li>
            </ul>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="p-8 bg-zinc-950 border border-zinc-800 rounded-3xl space-y-6">
              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
                Backup File Schema (.llbak)
              </h3>
              <pre className="p-6 bg-zinc-900 rounded-2xl text-emerald-300 font-mono text-xs overflow-x-auto leading-relaxed border border-zinc-800">
{`{
  "format": "loginlens_encrypted_vault_v1",
  "version": "1.0.0",
  "exported_at": "2026-08-09T12:00:00.000Z",
  "slice_type": "all",
  "encryption": "AES-256-GCM / PBKDF2-HMAC-SHA256",
  "payload": "<base64 envelope, laid out below>"
}`}
              </pre>

              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
                Envelope Byte Layout (base64-decoded payload)
              </h3>
              <pre className="p-6 bg-zinc-900 rounded-2xl text-emerald-300 font-mono text-xs overflow-x-auto leading-relaxed border border-zinc-800">
{`byte  0       magic, 0x4C ('L')
byte  1       format version, 0x01
bytes 2-5     PBKDF2 iterations, uint32 big-endian (600000)
bytes 6-21    salt, 16 bytes
bytes 22-33   AES-GCM IV, 12 bytes
bytes 34-     ciphertext + 16-byte auth tag

key = PBKDF2-HMAC-SHA256(passphrase, salt, iterations) -> 32 bytes`}
              </pre>
              <p className="text-xs text-zinc-400 leading-relaxed">
                The Export wizard also hands you a standalone Python decryptor
                for this exact layout, so a backup never depends on LoginLens
                still being installed — or on this website still existing.
              </p>
            </div>
          </div>
        )}
      </div>
    )
  },
  {
    id: 'scrapers',
    title: 'Connected Apps Scraper Engine',
    icon: <Search className="w-5 h-5" />,
    shortSummary: 'Google Handler registry, connected apps scanner, and DOM parser.',
    content: (viewMode: 'short' | 'long') => (
      <div className="space-y-8">
        <div>
          <span className="px-3.5 py-1.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-bold uppercase tracking-wider">
            Automated Scrapers
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold text-zinc-100 mt-3 mb-3">
            Connected Apps Scraper Engine
          </h2>
          <p className="text-zinc-300 text-base md:text-lg leading-relaxed">
            LoginLens includes modular DOM handler scrapers (<code className="text-cyan-400 font-mono">HandlerRegistry.ts</code> and <code className="text-cyan-400 font-mono">GoogleHandler.ts</code>) that scan signed-in account portals to import connected OAuth applications automatically.
          </p>
        </div>

        {viewMode === 'short' ? (
          <div className="p-8 rounded-3xl bg-cyan-950/40 border border-cyan-500/30 text-sm text-zinc-300 space-y-3">
            <h3 className="text-base font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
              <Search size={18} /> Scraper Engine Highlights
            </h3>
            <ul className="list-disc pl-6 space-y-2 leading-relaxed">
              <li><strong>Target Page:</strong> Automatically triggers on <code className="text-cyan-400 font-mono">myaccount.google.com/linkedapps</code>.</li>
              <li><strong>Aria-Label Parsing:</strong> Scans profile chips and <code className="text-cyan-400 font-mono">data-email</code> attributes for active user email.</li>
              <li><strong>Zero Cloud Telemetry:</strong> All extracted connected app names stay within your browser.</li>
            </ul>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="p-8 bg-zinc-950 border border-zinc-800 rounded-3xl space-y-5 text-sm text-zinc-300">
              <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">
                Scraper Handler Execution Lifecycle
              </h3>
              <p className="text-zinc-400 leading-relaxed">
                When navigating to account management portals, <code className="text-cyan-400 font-mono">universal-scraper.ts</code> executes top-level frame checks and invokes matching handlers registered in <code className="text-cyan-400 font-mono">HandlerRegistry</code>.
              </p>
            </div>
          </div>
        )}
      </div>
    )
  },
  {
    id: 'decryption',
    title: 'In-Browser Decryption & CSV Export',
    icon: <FileSpreadsheet className="w-5 h-5" />,
    shortSummary: 'Standalone Web Crypto decryptor tool with 1-click CSV & JSON export.',
    content: (viewMode: 'short' | 'long') => (
      <div className="space-y-8">
        <div>
          <span className="px-3.5 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold uppercase tracking-wider">
            Client-Side Decryption Tool
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold text-zinc-100 mt-3 mb-3">
            In-Browser Decryption & CSV Export
          </h2>
          <p className="text-zinc-300 text-base md:text-lg leading-relaxed">
            The landing page includes an offline-capable Web Crypto decryption engine (<code className="text-emerald-400 font-mono">/#/decrypt</code>) that allows users to decrypt their <code className="text-emerald-400 font-mono">.json.enc</code> vault files and export to CSV without extension dependency.
          </p>
        </div>

        {viewMode === 'short' ? (
          <div className="p-8 rounded-3xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-300 space-y-3">
            <h3 className="text-base font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
              <CheckCircle size={18} /> Decryption Tool Features
            </h3>
            <ul className="list-disc pl-6 space-y-2 leading-relaxed">
              <li><strong>Client-Side Only:</strong> decrypts <code className="text-emerald-400 font-mono">.llbak</code> files in page memory with the Web Crypto API. The page makes no network requests at all — neither the file nor the passphrase is uploaded anywhere.</li>
              <li><strong>CSV Export Standard:</strong> Formats entries into <code className="text-emerald-400 font-mono">name,url,username,password,note</code>, which Chrome, Firefox, 1Password and Bitwarden all import. The <code className="text-emerald-400 font-mono">password</code> column is always empty — LoginLens never stored one.</li>
            </ul>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="p-8 bg-zinc-950 border border-zinc-800 rounded-3xl space-y-5 text-sm text-zinc-300">
              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
                CSV Export Column Specification
              </h3>
              <pre className="p-6 bg-zinc-900 rounded-2xl text-emerald-300 font-mono text-xs overflow-x-auto leading-relaxed border border-zinc-800">
name,url,username,password,note
Work,figma.com,you@example.com,,LoginLens: Authenticated via Google
Personal,github.com,you@example.com,,
Deploy token,vercel.com,ci@example.com,,LoginLens: API Key / Token
              </pre>
              <p className="text-xs text-zinc-400 leading-relaxed">
                The <code className="text-emerald-400 font-mono">password</code>{' '}
                column is present because importers reject a file without it,
                and empty because there is nothing to put in it — LoginLens
                records who you sign in as, never what you sign in with.
              </p>
            </div>
          </div>
        )}
      </div>
    ),
  },
  {
    id: 'manifest',
    title: 'Manifest V3 & Plasmo Targets',
    icon: <FileCode className="w-5 h-5" />,
    shortSummary: 'Manifest V3 spec, permission rationales, and Plasmo build target flags.',
    content: (viewMode: 'short' | 'long') => (
      <div className="space-y-8">
        <div>
          <span className="px-3.5 py-1.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold uppercase tracking-wider">
            Browser Specification
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold text-zinc-100 mt-3 mb-3">
            Manifest V3 Spec & Plasmo Targets
          </h2>
          <p className="text-zinc-300 text-base md:text-lg leading-relaxed">
            LoginLens uses Google's Manifest V3 standard built with the Plasmo Framework to provide background service workers and non-blocking declarative privacy controls.
          </p>
        </div>

        {viewMode === 'short' ? (
          <div className="p-8 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-4 text-sm text-zinc-300">
            <h3 className="text-base font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
              <Zap size={18} /> Official Plasmo Target Flags
            </h3>
            <ul className="space-y-2 leading-relaxed font-mono">
              <li><strong className="text-blue-300">chrome-mv3:</strong> Default Chromium build target.</li>
              <li><strong className="text-blue-300">firefox-mv2 / firefox-mv3:</strong> Firefox WebExtension targets.</li>
              <li><strong className="text-blue-300">edge-mv3 / brave-mv3 / opera-mv3:</strong> Dedicated MV3 target flags.</li>
              <li><strong className="text-blue-300">safari-mv3:</strong> Converted via safari-web-extension-converter.</li>
            </ul>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="p-8 bg-zinc-950 border border-zinc-800 rounded-3xl space-y-5">
              <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider">
                Full Manifest V3 Permission Matrix
              </h3>
              <div className="grid gap-4 text-sm">
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <strong className="text-zinc-100 font-mono block text-base">"permissions": ["storage"]</strong>
                  <p className="text-zinc-400 mt-1">Grants access to Chrome's sandboxed local storage engine for encrypted identity storage.</p>
                </div>
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <strong className="text-zinc-100 font-mono block text-base">"permissions": ["activeTab", "scripting"]</strong>
                  <p className="text-zinc-400 mt-1">Enables inline form overlays on the user's active tab when logging into websites.</p>
                </div>
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <strong className="text-zinc-100 font-mono block text-base">"externally_connectable"</strong>
                  <p className="text-zinc-400 mt-1">Permits <code className="text-blue-400">https://loginlens.vkrishna04.me/*</code> to ping the background worker for extension detection.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  },
  {
    id: 'safari',
    title: 'Safari Web Extension Sideloading',
    icon: <Compass className="w-5 h-5" />,
    shortSummary: 'Sideloading guide for Safari on macOS and iOS via Xcode.',
    content: (viewMode: 'short' | 'long') => (
      <div className="space-y-8">
        <div>
          <span className="px-3.5 py-1.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-bold uppercase tracking-wider">
            Apple macOS / iOS Support
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold text-zinc-100 mt-3 mb-3">
            Safari Web Extension Sideloading Guide
          </h2>
          <p className="text-zinc-300 text-base md:text-lg leading-relaxed">
            Safari handles browser extensions differently from Chromium and Firefox. Safari requires extensions to be wrapped inside a lightweight Native macOS/iOS Host Application using Xcode.
          </p>
        </div>

        {viewMode === 'short' ? (
          <div className="p-8 rounded-3xl bg-cyan-950/40 border border-cyan-500/30 text-sm text-zinc-300 space-y-4">
            <h3 className="text-base font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
              <Compass size={18} /> Safari Sideloading at a Glance
            </h3>
            <ol className="list-decimal pl-6 space-y-2.5 leading-relaxed">
              <li>Run <code className="text-cyan-400 font-mono">xcrun safari-web-extension-converter build/safari-mv3-prod</code></li>
              <li>Open the generated Xcode project and select <strong>Build & Run</strong>.</li>
              <li>In Safari settings: Enable <strong>Develop → Allow Unsigned Extensions</strong>.</li>
              <li>Check LoginLens in Safari Extension Preferences!</li>
            </ol>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="p-8 bg-zinc-950 border border-zinc-800 rounded-3xl space-y-6">
              <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">
                Step-by-Step Xcode & Safari Setup
              </h3>
              <div className="space-y-4 text-sm text-zinc-300">
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <strong className="text-zinc-100 text-base block mb-2">Step 1: Convert Build to Xcode App</strong>
                  <pre className="p-4 bg-zinc-950 rounded-xl text-cyan-400 font-mono text-xs overflow-x-auto my-2">
                    xcrun safari-web-extension-converter ./build/safari-mv3-prod --app-name LoginLens
                  </pre>
                </div>
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <strong className="text-zinc-100 text-base block mb-2">Step 2: Xcode Build & Signing</strong>
                  <p className="text-zinc-400">Open the generated <code className="text-cyan-400 font-mono">LoginLens.xcodeproj</code> in Xcode. Set Team to Personal Team and click Build.</p>
                </div>
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <strong className="text-zinc-100 text-base block mb-2">Step 3: Enable Developer Extensions in Safari</strong>
                  <p className="text-zinc-400">Open Safari → Settings → Advanced → Check "Show Develop menu in menu bar". Under Develop menu, select "Allow Unsigned Extensions".</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }
];

export const DocsPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<string>('architecture');
  const [viewMode, setViewMode] = useState<'short' | 'long'>('long');

  const current = DOCS_SECTIONS.find((s) => s.id === activeSection) || DOCS_SECTIONS[0];

  return (
    <main className="min-h-screen pt-32 pb-24 px-6 max-w-7xl mx-auto w-full scale-105 transform-gpu transition-all">
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl md:text-6xl font-extrabold text-zinc-50 tracking-tight mb-3">
            Documentation & Manual
          </h1>
          <p className="text-zinc-400 text-base md:text-lg">
            Detailed technical reference, security models, Plasmo build targets, and client-side cryptography.
          </p>
        </div>

        {/* Short vs Long Version Toggle */}
        <div className="flex items-center gap-2 p-2 rounded-2xl bg-zinc-900 border border-zinc-800 shrink-0">
          <button
            onClick={() => setViewMode('short')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              viewMode === 'short'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Zap size={16} /> Short Version
          </button>
          <button
            onClick={() => setViewMode('long')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              viewMode === 'long'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <BookOpen size={16} /> Long / Full Version
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar */}
        <aside className="w-full lg:w-80 shrink-0 space-y-2">
          {DOCS_SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full p-4.5 rounded-2xl font-bold text-xs flex items-center justify-between transition-all ${
                activeSection === section.id
                  ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/30 scale-102'
                  : 'bg-zinc-900/40 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 border border-zinc-800/60'
              }`}
            >
              <div className="flex items-center gap-3.5">
                {section.icon}
                <div className="text-left">
                  <div className="text-sm font-extrabold">{section.title}</div>
                  <div className="text-[11px] opacity-70 font-normal line-clamp-1 mt-0.5">{section.shortSummary}</div>
                </div>
              </div>
              <ChevronRight size={16} className={activeSection === section.id ? 'text-white' : 'text-zinc-600'} />
            </button>
          ))}
        </aside>

        {/* Main Content Area */}
        <article className="flex-1 bg-zinc-900/60 border border-zinc-800 rounded-3xl p-8 md:p-12 backdrop-blur-2xl shadow-2xl">
          {current.content(viewMode)}
        </article>
      </div>
    </main>
  );
};
