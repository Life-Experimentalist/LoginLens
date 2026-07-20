import React, { useState, useRef, useEffect } from 'react';
import { useStorage } from '@plasmohq/storage/hook';
import { extensionStorage } from '../../core/storage/config';
import { parseEdgePasswordsCSV } from '../../core/utils/csv-parser';
import type { DomainEntry } from '../../core/storage/schema';
import { UploadCloud, AlertTriangle, Sliders, Database, Sun, Moon, Monitor, Code, Trash2, Copy, Radio, RefreshCw, Download, ArrowRightLeft } from 'lucide-react';
import { useTheme } from 'next-themes';
import { log, type LogEntry } from '../../core/utils/logger';

type SettingsTab = 'general' | 'data' | 'developer';

export const SettingsView: React.FC = () => {
  const [savedAccounts, setSavedAccounts] = useStorage<DomainEntry[]>({ key: "saved_accounts", instance: extensionStorage }, []);
  const [oauthRegistry, setOauthRegistry] = useStorage<any[]>({ key: "oauth_registry", instance: extensionStorage }, []);
  const [exportType, setExportType] = useState<'all' | 'oauth' | 'password'>('all');
  const [debugMode, setDebugMode] = useStorage<boolean>({ key: "debug_mode", instance: extensionStorage }, process.env.NODE_ENV === 'development');
  const [alwaysRecordOauth, setAlwaysRecordOauth] = useStorage<boolean>({ key: "always_record_oauth", instance: extensionStorage }, false);
  const [reviewItems, setReviewItems] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const { theme, setTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === 'developer') {
      log.getLogs().then(setLogs);
      const interval = setInterval(() => log.getLogs().then(setLogs), 2000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const sourceTag = window.prompt("Enter a label for this import (e.g. 'Microsoft Edge' or 'Google Password Manager')") || "Imported Passwords";
      try {
        const result = parseEdgePasswordsCSV(text);
        
        const updatedAccounts = [...(savedAccounts || [])];
        
        result.validDomains.forEach(newDomainMap => {
          const existingDomainIdx = updatedAccounts.findIndex(d => d.domain === newDomainMap.domain);
          if (existingDomainIdx >= 0) {
            const existingAccounts = updatedAccounts[existingDomainIdx].accounts;
            newDomainMap.accounts.forEach(newAcc => {
              const existingIdx = existingAccounts.findIndex(
                ea => ea.login_method?.type === newAcc.login_method?.type && ea.identities[0] === newAcc.identities[0]
              );
              
              if (existingIdx >= 0) {
                // If exists, append the source tag to the existing account
                const existing = existingAccounts[existingIdx];
                existing.vault_source = existing.vault_source 
                  ? (existing.vault_source.includes(sourceTag) ? existing.vault_source : `${existing.vault_source}, ${sourceTag}`)
                  : sourceTag;
              } else {
                newAcc.vault_source = sourceTag;
                existingAccounts.push(newAcc);
              }
            });
          } else {
            newDomainMap.accounts.forEach(acc => acc.vault_source = sourceTag);
            updatedAccounts.push(newDomainMap);
          }
        });

        setSavedAccounts(updatedAccounts);
        setReviewItems(result.reviewNeeded);
        alert(`Successfully imported ${result.validDomains.reduce((acc, d) => acc + d.accounts.length, 0)} accounts!`);
      } catch (err: any) {
        alert("Failed to parse CSV: " + err.message);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMigrate = () => {
    if (!savedAccounts || !oauthRegistry) return;
    const newReg = [...oauthRegistry];
    let modified = false;

    savedAccounts.forEach(domainEntry => {
      domainEntry.accounts.forEach(acc => {
        if (acc.login_method?.type === 'oauth' && acc.login_method.provider) {
          const regEntry = newReg.find(r => r.provider === acc.login_method.provider && r.identity === acc.identities[0]);
          if (regEntry) {
            regEntry.linked_websites = regEntry.linked_websites || [];
            if (!regEntry.linked_websites.includes(domainEntry.domain)) {
              regEntry.linked_websites.push(domainEntry.domain);
              modified = true;
            }
          }
        }
      });
    });

    if (modified) {
      setOauthRegistry(newReg);
      alert('Migration complete: Linked websites populated in registry.');
    } else {
      alert('No new migrations needed. Everything is up to date.');
    }
  };

  const handleExport = () => {
    let dataToExport: any = {};
    if (exportType === 'all' || exportType === 'password') {
      dataToExport.saved_accounts = savedAccounts?.filter(d => 
        exportType === 'all' || d.accounts.some(a => a.login_method.type === 'password')
      ) || [];
    }
    if (exportType === 'all' || exportType === 'oauth') {
      dataToExport.oauth_registry = oauthRegistry;
    }
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loginlens-export-${exportType}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto w-full pb-20">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Settings</h1>
        <p className="text-muted-foreground">Configure LoginLens preferences and manage data.</p>
      </div>

      {/* Horizontal Sub-Tabs */}
      <div className="flex border-b border-border mb-6 gap-6">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 pb-3 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'general'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Sliders size={16} />
          General
        </button>
        <button
          onClick={() => setActiveTab('data')}
          className={`flex items-center gap-2 pb-3 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'data'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Database size={16} />
          Data Management
        </button>
        <button
          onClick={() => setActiveTab('developer')}
          className={`flex items-center gap-2 pb-3 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'developer'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Code size={16} />
          Developer
        </button>
      </div>

      {/* Tab Content: General */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-lg font-semibold border-b border-border pb-2">Appearance & Theme</h3>
            <div className="flex justify-between items-center py-2">
              <div>
                <p className="font-medium text-foreground">Color Theme</p>
                <p className="text-sm text-muted-foreground">Choose between Light, Dark, or System mode.</p>
              </div>
              <div className="flex items-center gap-2 bg-muted p-1 rounded-lg border border-border">
                <button
                  onClick={() => setTheme('light')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                    theme === 'light' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Sun size={14} /> Light
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                    theme === 'dark' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Moon size={14} /> Dark
                </button>
                <button
                  onClick={() => setTheme('system')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                    theme === 'system' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Monitor size={14} /> System
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-lg font-semibold border-b border-border pb-2">Behavior & Inference</h3>
            
            <div className="flex justify-between items-center py-2">
              <div>
                <p className="font-medium text-foreground">AI DOM Inference Patcher</p>
                <p className="text-sm text-muted-foreground">Automatically infer obscure login field names using local fallback heuristics.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={aiEnabled}
                onClick={() => setAiEnabled(!aiEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background ${
                  aiEnabled ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full shadow-md transition-transform duration-200 ${
                    aiEnabled ? 'translate-x-6 bg-white dark:bg-black' : 'translate-x-1 bg-white'
                  }`}
                />
              </button>
            </div>

            <div className="flex justify-between items-center py-2 border-t border-border mt-2 pt-4">
              <div>
                <p className="font-medium text-foreground">Always Record OAuth Logins</p>
                <p className="text-sm text-muted-foreground">Automatically monitor and record all OAuth logins without clicking the Record button.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={alwaysRecordOauth}
                onClick={() => setAlwaysRecordOauth(!alwaysRecordOauth)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background ${
                  alwaysRecordOauth ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full shadow-md transition-transform duration-200 ${
                    alwaysRecordOauth ? 'translate-x-6 bg-white dark:bg-black' : 'translate-x-1 bg-white'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Data Management */}
      {activeTab === 'data' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-lg font-semibold border-b border-border pb-2">Vault Storage</h3>
            
            <div className="flex justify-between items-center py-2">
              <div>
                <p className="font-medium text-foreground">Import Edge Passwords (.csv)</p>
                <p className="text-sm text-muted-foreground">Bulk import your existing Edge browser exported passwords.</p>
              </div>
              <input 
                type="file" 
                accept=".csv" 
                className="hidden" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 font-medium rounded-md transition-colors"
              >
                <UploadCloud size={16} />
                Import CSV
              </button>
            </div>

            <div className="flex justify-between items-center py-2 border-t border-border mt-2 pt-4">
              <div>
                <p className="font-medium text-foreground">Export Data</p>
                <p className="text-sm text-muted-foreground">Download your vault data as JSON for backup.</p>
              </div>
              <div className="flex items-center gap-2">
                <select 
                  value={exportType}
                  onChange={(e) => setExportType(e.target.value as any)}
                  className="bg-muted border border-border rounded-md text-sm px-2 py-1.5 focus:outline-none"
                >
                  <option value="all">All Data</option>
                  <option value="oauth">OAuth Only</option>
                  <option value="password">Passwords Only</option>
                </select>
                <button 
                  onClick={handleExport}
                  className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 font-medium rounded-md transition-colors"
                >
                  <Download size={16} />
                  Export JSON
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center py-2 border-t border-border mt-2 pt-4">
              <div>
                <p className="font-medium text-foreground text-amber-500">Migrate Schema (Temp)</p>
                <p className="text-sm text-muted-foreground">Transforms older schemas into the new linked_websites format.</p>
              </div>
              <button 
                onClick={handleMigrate}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 font-medium rounded-md transition-colors border border-amber-500/20"
              >
                <ArrowRightLeft size={16} />
                Run Migration
              </button>
            </div>

            <div className="flex justify-between items-center py-2 border-t border-border mt-2 pt-4">
              <div>
                <p className="font-medium text-foreground">Clear Local Vault</p>
                <p className="text-sm text-muted-foreground">Permanently wipe all stored identity mapping data.</p>
              </div>
              <button 
                onClick={() => {
                  if (confirm('Are you sure you want to clear all data?')) {
                    setSavedAccounts([]);
                    setReviewItems([]);
                  }
                }}
                className="px-4 py-2 bg-destructive/10 text-destructive hover:bg-destructive/20 font-medium rounded-md transition-colors"
              >
                Clear Data
              </button>
            </div>
          </div>

          {reviewItems.length > 0 && (
            <div className="p-6 rounded-xl border border-yellow-500/50 bg-yellow-500/5 shadow-sm space-y-4">
              <div className="flex items-center gap-3 border-b border-yellow-500/20 pb-2">
                <AlertTriangle className="text-yellow-500" size={24} />
                <h3 className="text-lg font-semibold text-yellow-600 dark:text-yellow-500">Needs Review ({reviewItems.length} items)</h3>
              </div>
              <p className="text-sm text-muted-foreground">These rows were skipped during CSV processing due to missing usernames or passwords.</p>
              <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                {reviewItems.map((item, idx) => (
                  <div key={idx} className="p-3 bg-background rounded border border-border flex justify-between items-center">
                    <div className="truncate pr-4">
                      <p className="font-medium text-sm truncate">{item.name || item.url || 'Unknown URL'}</p>
                      <p className="text-xs text-muted-foreground">{item.username || '(No Username)'}</p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-red-500/10 text-red-500 rounded font-medium whitespace-nowrap">
                      {item.reason}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Developer */}
      {activeTab === 'developer' && (
        <div className="space-y-6">
          <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-lg font-semibold border-b border-border pb-2 flex items-center justify-between">
              <span>Developer & Diagnostics</span>
            </h3>
            
            <div className="flex justify-between items-center py-2">
              <div>
                <p className="font-medium text-foreground flex items-center gap-2"><Radio size={15} className="text-primary" /> Debug Logging</p>
                <p className="text-sm text-muted-foreground">Enable verbose internal logging for tracking complex OAuth redirect chains.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={debugMode}
                onClick={() => setDebugMode(!debugMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background ${
                  debugMode ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full shadow-md transition-transform duration-200 ${
                    debugMode ? 'translate-x-6 bg-white dark:bg-black' : 'translate-x-1 bg-white'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4 flex flex-col h-[500px]">
            <div className="flex justify-between items-center border-b border-border pb-2">
              <h3 className="text-lg font-semibold">System Logs</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const text = logs.map(l => `[${new Date(l.timestamp).toISOString()}] [${l.level}] ${l.message} ${l.data ? JSON.stringify(l.data) : ''}`).join('\n');
                    navigator.clipboard.writeText(text);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
                >
                  <Copy size={14} /> Copy All
                </button>
                <button
                  onClick={() => { log.clearLogs(); setLogs([]); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                >
                  <Trash2 size={14} /> Clear
                </button>
              </div>
            </div>
            
            <div ref={logContainerRef} className="flex-1 overflow-y-auto bg-muted/30 rounded-lg border border-border p-3 space-y-1 font-mono text-[10px]">
              {logs.length === 0 ? (
                <div className="text-center text-muted-foreground mt-20">No logs captured yet.</div>
              ) : (
                logs.map((l, i) => (
                  <div key={i} className="flex gap-3 py-1 border-b border-border/40 last:border-0 hover:bg-muted/50">
                    <span className="text-muted-foreground shrink-0">{new Date(l.timestamp).toLocaleTimeString()}</span>
                    <span className={`shrink-0 w-12 font-bold ${
                      l.level === 'ERROR' ? 'text-red-500' : l.level === 'WARN' ? 'text-yellow-500' : l.level === 'DEBUG' ? 'text-blue-500' : 'text-green-500'
                    }`}>{l.level}</span>
                    <span className="text-foreground break-all">
                      {l.message}
                      {l.data && <span className="block text-muted-foreground mt-0.5">{JSON.stringify(l.data)}</span>}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
