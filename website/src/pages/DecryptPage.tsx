import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Lock,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Download,
  Copy,
  FileText,
  RefreshCw,
  Eye,
  EyeOff,
  Wifi,
  WifiOff
} from 'lucide-react';
import { decryptVaultPayload, convertVaultToBrowserCSV, type DecryptedVaultData } from '../utils/crypto';

export const DecryptPage: React.FC = () => {
  const [filePayload, setFilePayload] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [masterPassword, setMasterPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [decryptedData, setDecryptedData] = useState<DecryptedVaultData | null>(null);
  const [isDecrypting, setIsDecrypting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copiedJson, setCopiedJson] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Starts `true` on purpose. There is no `navigator` while this page is
  // prerendered, and seeding from it on the first client render would make the
  // markup disagree with the server's. The effect below corrects it immediately.
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    const sync = () => setIsOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  const handleFile = (file: File) => {
    setFileName(file.name);
    setErrorMsg('');
    setDecryptedData(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setFilePayload(text || '');
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read file.');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDecrypt = async () => {
    if (!filePayload) {
      setErrorMsg('Please upload or select an encrypted backup file first.');
      return;
    }

    setIsDecrypting(true);
    setErrorMsg('');

    try {
      const result = await decryptVaultPayload(filePayload, masterPassword);
      setDecryptedData(result);
    } catch (err: any) {
      setErrorMsg(err.message || 'Decryption failed. Check the passphrase and try again.');
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleDownloadJSON = () => {
    if (!decryptedData) return;
    // `raw` is the decrypted document exactly as it was written, not our
    // normalised view of it — a re-import has to see the original shape.
    const jsonStr = JSON.stringify(decryptedData.raw, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName
      ? `${fileName.replace(/\.(llbak|enc|json)$/i, '')}.json`
      : 'loginlens_vault_decrypted.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCSV = () => {
    if (!decryptedData?.savedAccounts.length) return;
    const csvContent = convertVaultToBrowserCSV(decryptedData.savedAccounts);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'loginlens_browser_passwords.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyJSON = async () => {
    if (!decryptedData) return;
    // Clipboard writes reject when the page is not focused. Flipping the label
    // to "Copied!" regardless tells the user their vault is on the clipboard
    // when it is not.
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(decryptedData.raw, null, 2)
      );
    } catch {
      setErrorMsg('Could not access the clipboard. Use "Download JSON" instead.');
      return;
    }
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // Stats calculation
  const totalDomains = decryptedData?.savedAccounts?.length || 0;
  const totalAccounts = decryptedData?.savedAccounts?.reduce(
    (acc, d) => acc + (d.accounts?.length || 0),
    0
  ) || 0;
  const oauthCount = decryptedData?.savedAccounts?.reduce(
    (acc, d) => acc + (d.accounts?.filter((a) => a.login_method?.type === 'oauth').length || 0),
    0
  ) || 0;
  const apiKeyCount = decryptedData?.savedAccounts?.reduce(
    (acc, d) => acc + (d.accounts?.filter((a) => a.login_method?.type === 'api-key' || a.login_method?.type === 'api_key').length || 0),
    0
  ) || 0;

  return (
    <main className="min-h-screen pt-28 pb-20 px-6 max-w-5xl mx-auto w-full flex flex-col items-center">
      {/* Zero-Server Security Guarantee Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full mb-10 p-5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 backdrop-blur-xl flex items-center justify-between flex-wrap gap-4 shadow-lg shadow-indigo-500/5"
      >
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400 shrink-0">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              100% Client-Side Decryption Engine
              <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Zero Server Uploads
              </span>
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              There is no backend behind this page — no server of ours receives anything, because there is no server. It is a static file, and it makes no network request of any kind once it has loaded. Your backup and passphrase never leave this tab.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Main Container */}
      <div className="w-full bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 md:p-10 shadow-2xl backdrop-blur-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-3xl md:text-4xl font-extrabold text-zinc-50 tracking-tight mb-3">
            Offline Vault Decryptor
          </h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Upload your LoginLens <code className="text-indigo-400 font-mono">.llbak</code> backup to decrypt it and export to JSON or Browser CSV format anytime. Unencrypted <code className="text-indigo-400 font-mono">.json</code> backups open here too, no passphrase needed.
          </p>
        </div>

        {!decryptedData ? (
          <div className="space-y-8 max-w-xl mx-auto">
            {/* A page that asks for a vault and a passphrase is exactly what a
                lookalike domain would imitate, so it says out loud where it is
                and where it is not needed. */}
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3">
              <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-400" />
              <div className="text-xs text-zinc-300 leading-relaxed">
                <p className="font-bold text-amber-300">Only ever type this passphrase on a page you navigated to yourself.</p>
                <p className="mt-1 text-zinc-400">
                  The only address that should ever ask for it is{' '}
                  <code className="font-mono text-zinc-200">loginlens.vkrishna04.me/decrypt</code>{' '}
                  — check the address bar. If you still have the extension installed, you do not need this page at all:
                  use <span className="text-zinc-200 font-semibold">Settings → Data → Import Wizard</span>, which never sends the file
                  through a browser tab.
                </p>
              </div>
            </div>

            {/* You do not have to take "it makes no network requests" on faith.
                Cutting the network makes it unfalsifiable for as long as the
                vault is on screen — which also covers the case this page cannot
                defend against on its own, a version of it that is not ours. */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800">
                <p className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                  Prove it: decrypt with the network off
                </p>
                <span
                  className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                    isOnline
                      ? 'bg-zinc-800/80 text-zinc-400 border-zinc-700'
                      : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  }`}
                >
                  {isOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
                  {isOnline ? 'Network on' : 'Network off'}
                </span>
              </div>

              <ol className="px-4 py-3 space-y-1.5 text-xs text-zinc-400 leading-relaxed list-decimal list-inside marker:text-zinc-600 marker:font-bold">
                <li>Stay on this page — it is already fully loaded.</li>
                <li>
                  Turn off Wi-Fi or unplug the cable. The badge above flips to{' '}
                  <span className="text-emerald-400 font-semibold">Network off</span>.
                </li>
                <li>Drop your backup in below and enter the passphrase.</li>
                <li>Download the JSON (and the CSV, if you want it).</li>
                <li>
                  <span className="text-zinc-200 font-semibold">Close this tab</span> — before you reconnect, not after.
                </li>
                <li>Turn the network back on.</li>
              </ol>

              <p className="px-4 pb-3 text-[11px] text-zinc-500 leading-relaxed">
                Step 5 is the one that matters. A page cannot upload anything while the
                network is down, but it could hold data and send it the moment you
                reconnect. Closing the tab first removes that possibility, because
                nothing here is written to disk: your vault lives in memory only —
                no cookies, no local storage, no service worker. Closing the tab
                is what erases it.
              </p>
            </div>

            {/* Drag & Drop File Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
                  : fileName
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/50'
              }`}
            >
              <input
                type="file"
                accept=".llbak,.json,.enc,.txt"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />

              <div className="flex flex-col items-center gap-3">
                <div className={`p-4 rounded-2xl ${fileName ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800/80 text-zinc-400'}`}>
                  {fileName ? <CheckCircle2 size={32} /> : <UploadCloud size={32} />}
                </div>
                <div>
                  {fileName ? (
                    <>
                      <p className="font-bold text-zinc-100 text-sm">{fileName}</p>
                      <p className="text-xs text-zinc-400 mt-1">File loaded. Ready for your backup passphrase.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-zinc-200 text-sm">
                        Drop your <code className="text-indigo-400 font-mono">loginlens_vault.llbak</code> file here
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">or click to browse your local device</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Master Password Input */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Backup Passphrase
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="The passphrase you set when exporting..."
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDecrypt()}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors pr-12 font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-400 text-xs font-medium"
              >
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </motion.div>
            )}

            {/* Decrypt Button */}
            <button
              onClick={handleDecrypt}
              disabled={isDecrypting || !filePayload}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDecrypting ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Decrypting Locally...
                </>
              ) : (
                <>
                  <Lock size={18} />
                  Decrypt Vault File
                </>
              )}
            </button>
          </div>
        ) : (
          /* Decrypted Result View */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-8 max-w-2xl mx-auto"
          >
            {/* Decryption Success Badge */}
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3 text-emerald-400">
              <CheckCircle2 size={22} className="shrink-0" />
              <div>
                <p className="font-bold text-sm text-zinc-100">Vault Decrypted Successfully!</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Your credentials have been securely decrypted in memory. Download your desired format below.
                </p>
              </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
                <p className="text-2xl font-extrabold text-indigo-400">{totalDomains}</p>
                <p className="text-xs text-zinc-400 mt-1 font-medium">Websites</p>
              </div>
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
                <p className="text-2xl font-extrabold text-purple-400">{totalAccounts}</p>
                <p className="text-xs text-zinc-400 mt-1 font-medium">Logins</p>
              </div>
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
                <p className="text-2xl font-extrabold text-blue-400">{oauthCount}</p>
                <p className="text-xs text-zinc-400 mt-1 font-medium">OAuth Flows</p>
              </div>
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
                <p className="text-2xl font-extrabold text-amber-400">{apiKeyCount}</p>
                <p className="text-xs text-zinc-400 mt-1 font-medium">API Keys</p>
              </div>
            </div>

            {errorMsg && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-400 text-xs font-medium">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
              <button
                onClick={handleDownloadJSON}
                className="py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md"
              >
                <Download size={16} /> Download JSON
              </button>

              <button
                onClick={handleDownloadCSV}
                className="py-3.5 px-4 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md"
              >
                <FileText size={16} /> Download Browser CSV
              </button>

              <button
                onClick={handleCopyJSON}
                className="py-3.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all border border-zinc-700"
              >
                {copiedJson ? <CheckCircle2 size={16} className="text-emerald-400" /> : <Copy size={16} />}
                {copiedJson ? 'Copied!' : 'Copy to Clipboard'}
              </button>
            </div>

            <p className="text-xs text-zinc-500 leading-relaxed text-center">
              The CSV opens in Chrome, Firefox, 1Password and Bitwarden. Its{' '}
              <code className="font-mono text-zinc-400">password</code> column is empty on every row — LoginLens records
              who you sign in as, never what you sign in with.
            </p>

            {/* The last step of the offline recipe, shown at the point it is
                actually due rather than only in the instructions up top. */}
            <div className={`p-4 rounded-xl border flex items-start gap-3 ${
              isOnline
                ? 'bg-zinc-950/60 border-zinc-800'
                : 'bg-emerald-500/10 border-emerald-500/25'
            }`}>
              {isOnline ? (
                <Wifi size={18} className="shrink-0 mt-0.5 text-zinc-500" />
              ) : (
                <WifiOff size={18} className="shrink-0 mt-0.5 text-emerald-400" />
              )}
              <p className="text-xs text-zinc-400 leading-relaxed">
                {isOnline ? (
                  <>
                    <span className="font-bold text-zinc-200">Once you have your file, close this tab.</span>{' '}
                    Your vault is only in this page's memory — closing the tab is what clears it.
                  </>
                ) : (
                  <>
                    <span className="font-bold text-emerald-300">You are offline and your file is saved. Close this tab now,</span>{' '}
                    then reconnect. Nothing survives the tab closing.
                  </>
                )}
              </p>
            </div>

            <div className="text-center pt-4">
              <button
                onClick={() => {
                  setDecryptedData(null);
                  setFilePayload('');
                  setFileName('');
                  setMasterPassword('');
                  setErrorMsg('');
                }}
                className="text-xs text-zinc-500 hover:text-zinc-300 underline transition-colors"
              >
                Decrypt another backup file
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </main>
  );
};
