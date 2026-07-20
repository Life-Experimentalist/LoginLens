import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, Key, Globe, Pin, PinOff, Trash2, Edit3, ExternalLink } from 'lucide-react';
import type { IdentityProfile, DomainEntry, GlobalOAuthAccount } from '../../core/storage/schema';
import { useStorage } from '@plasmohq/storage/hook';
import { extensionStorage } from '../../core/storage/config';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  domain: string;
  accounts: IdentityProfile[];
}

export const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose, domain, accounts }) => {
  const [savedAccounts, setSavedAccounts] = useStorage<DomainEntry[]>({ key: "saved_accounts", instance: extensionStorage }, []);
  const [oauthRegistry, setOauthRegistry] = useStorage<GlobalOAuthAccount[]>({ key: "oauth_registry", instance: extensionStorage }, []);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editProvider, setEditProvider] = useState('');
  const [editSource, setEditSource] = useState('');
  const [editMfaType, setEditMfaType] = useState<any>('unknown');
  const [editMfaLoc, setEditMfaLoc] = useState('');
  const [editApiEndpoint, setEditApiEndpoint] = useState('');

  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const toggleReveal = (id: string) => {
    const next = new Set(revealedKeys);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setRevealedKeys(next);
  };

  const togglePin = (accId: string) => {
    if (!savedAccounts) return;
    const updated = savedAccounts.map(d => {
      if (d.domain !== domain) return d;
      return {
        ...d,
        accounts: d.accounts.map(acc =>
          acc.id === accId ? { ...acc, pinned: !acc.pinned } : acc
        )
      };
    });
    setSavedAccounts(updated);
  };

  const deleteAccount = (accId: string) => {
    if (!confirm(`Remove this login entry for ${domain}?`)) return;
    if (!savedAccounts) return;
    const updated = savedAccounts.map(d => {
      if (d.domain !== domain) return d;
      return { ...d, accounts: d.accounts.filter(acc => acc.id !== accId) };
    }).filter(d => d.accounts.length > 0);
    setSavedAccounts(updated);
    if (accounts.length <= 1) onClose();
  };

  const saveEdits = (accId: string) => {
    if (!savedAccounts) return;
    const updated = savedAccounts.map(d => {
      if (d.domain !== domain) return d;
      return {
        ...d,
        accounts: d.accounts.map(acc => {
          if (acc.id !== accId) return acc;
          const newIdents = [...acc.identities];
          newIdents[0] = editUsername || newIdents[0];
          return {
            ...acc,
            identities: newIdents,
            notes: editNotes,
            vault_source: editSource,
            api_endpoint: editApiEndpoint || undefined,
            login_method: acc.login_method.type === 'oauth' 
              ? { type: 'oauth', provider: editProvider || acc.login_method.provider } 
              : acc.login_method,
            mfa: editMfaType !== 'unknown' || editMfaLoc ? {
              type: editMfaType,
              device_location: editMfaLoc
            } : acc.mfa
          };
        })
      };
    });
    setSavedAccounts(updated);
    setEditingId(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                    alt={domain}
                    className="w-5 h-5"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">{domain}</h2>
                    <p className="text-xs text-muted-foreground">{accounts.length} saved login{accounts.length !== 1 ? 's' : ''}</p>
                  </div>
                  <a 
                    href={`https://${domain}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-md transition-colors"
                    title={`Open ${domain}`}
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground">
                <X size={18} />
              </button>
            </div>

            {/* Accounts list */}
            <div className="p-4 space-y-3 max-h-[55vh] overflow-y-auto">
              {accounts.length === 0 ? (
                <p className="text-sm text-center text-muted-foreground py-8">No accounts found for this domain.</p>
              ) : (
                accounts
                  .slice()
                  .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
                  .map((acc) => (
                    <div key={acc.id} className={`rounded-xl border ${acc.pinned ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-muted/30'} p-4 space-y-3 transition-colors`}>
                      {/* Identity + method */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-foreground text-sm truncate max-w-[220px]">{acc.identities[0]}</span>
                            {acc.label && acc.label !== 'None' && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold">{acc.label}</span>
                            )}
                            {acc.pinned && <span className="text-[10px] text-amber-500 font-bold">★ Pinned</span>}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {acc.login_method.type === 'oauth' ? <Globe size={12} /> : <Key size={12} />}
                            <span className="capitalize">{acc.login_method.type}</span>
                            {acc.login_method.provider && (
                              <span className="text-muted-foreground/70">via {acc.login_method.provider}</span>
                            )}
                          </div>
                        </div>
                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          {acc.login_method.type !== 'oauth' && (
                            <button
                              onClick={() => handleCopy(acc.identities[0], acc.id)}
                              className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
                              title="Copy username"
                            >
                              {copiedId === acc.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                            </button>
                          )}
                          <button
                            onClick={() => togglePin(acc.id)}
                            className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
                            title={acc.pinned ? "Unpin" : "Pin"}
                          >
                            {acc.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                          </button>
                          <button
                            onClick={() => { 
                              setEditingId(editingId === acc.id ? null : acc.id); 
                              setEditNotes(acc.notes || '');
                              setEditUsername(acc.identities[0] || '');
                              setEditProvider(acc.login_method.provider || '');
                              setEditSource(acc.vault_source || '');
                              setEditMfaType(acc.mfa?.type || 'unknown');
                              setEditMfaLoc(acc.mfa?.device_location || '');
                              setEditApiEndpoint(acc.api_endpoint || '');
                            }}
                            className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit details"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => deleteAccount(acc.id)}
                            className="p-1.5 hover:bg-red-500/10 rounded-md text-muted-foreground hover:text-red-500 transition-colors"
                            title="Remove entry"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Inline notes editor */}
                      <AnimatePresence>
                        {editingId === acc.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-3 pt-2 border-t border-border mt-2"
                          >
                            {acc.login_method.type === 'oauth' ? (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Provider</label>
                                  <select
                                    value={editProvider}
                                    onChange={(e) => { setEditProvider(e.target.value); setEditUsername(''); }}
                                    className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground"
                                  >
                                    <option value="" disabled>Select...</option>
                                    {Array.from(new Set(oauthRegistry?.map(r => r.provider) || [])).map(p => (
                                      <option key={p} value={p}>{p}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Account</label>
                                  <select
                                    value={editUsername}
                                    onChange={(e) => {
                                      if (e.target.value === '__add_new__') {
                                        const newId = prompt('Enter new email/username for ' + editProvider);
                                        if (newId) {
                                          setEditUsername(newId);
                                          setOauthRegistry([...(oauthRegistry || []), { id: crypto.randomUUID?.() ?? Math.random().toString(36).substring(2), provider: editProvider, identity: newId, created_at: Date.now(), updated_at: Date.now(), is_manual: true }]);
                                        }
                                      } else {
                                        setEditUsername(e.target.value);
                                      }
                                    }}
                                    className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground"
                                    disabled={!editProvider}
                                  >
                                    <option value="" disabled>Select...</option>
                                    {(oauthRegistry || []).filter(r => r.provider === editProvider).map(registryAcc => (
                                      <option key={registryAcc.id} value={registryAcc.identity}>
                                        {registryAcc.identity}
                                      </option>
                                    ))}
                                    <option value="__add_new__" className="font-semibold text-indigo-500">+ Add New Identity...</option>
                                  </select>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">{acc.login_method.type === 'api-key' ? 'Key Title / Name' : 'Username / Email'}</label>
                                <input
                                  type="text"
                                  value={editUsername}
                                  onChange={(e) => setEditUsername(e.target.value)}
                                  className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground"
                                />
                              </div>
                            )}
                            {acc.login_method.type === 'api-key' && (
                              <div>
                                <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Endpoint / URL</label>
                                <input
                                  type="text"
                                  value={editApiEndpoint}
                                  onChange={(e) => setEditApiEndpoint(e.target.value)}
                                  placeholder="e.g. https://api.example.com"
                                  className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground"
                                />
                              </div>
                            )}
                            {acc.login_method.type !== 'oauth' && (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Vault Source</label>
                                  <input
                                    type="text"
                                    placeholder="e.g. Edge Passwords"
                                    value={editSource}
                                    onChange={(e) => setEditSource(e.target.value)}
                                    className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">MFA Type</label>
                                  <select
                                    value={editMfaType}
                                    onChange={(e) => setEditMfaType(e.target.value)}
                                    className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground"
                                  >
                                    <option value="unknown">Unknown</option>
                                    <option value="totp">Authenticator App</option>
                                    <option value="hardware">Hardware Key</option>
                                    <option value="sms">SMS / Phone</option>
                                    <option value="email">Email</option>
                                    <option value="none">No MFA</option>
                                  </select>
                                </div>
                              </div>
                            )}
                            {editMfaType !== 'unknown' && editMfaType !== 'none' && (
                              <div>
                                <label className="text-[10px] uppercase font-bold text-muted-foreground">MFA Location/Device</label>
                                <input
                                  type="text"
                                  placeholder="e.g. iPhone, YubiKey Nano"
                                  value={editMfaLoc}
                                  onChange={(e) => setEditMfaLoc(e.target.value)}
                                  className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary text-foreground"
                                />
                              </div>
                            )}
                            <div>
                              <label className="text-[10px] uppercase font-bold text-muted-foreground">Notes</label>
                              <textarea
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                rows={2}
                                className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-primary resize-none text-foreground"
                              />
                            </div>
                            <div className="flex gap-2 justify-end pt-1">
                              <button onClick={() => setEditingId(null)} className="text-xs px-2.5 py-1 border border-border rounded-md hover:bg-muted transition-colors">Cancel</button>
                              <button onClick={() => saveEdits(acc.id)} className="text-xs px-2.5 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">Save Details</button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Show extra details if not editing */}
                      {editingId !== acc.id && (
                        <div className="space-y-1">
                          {acc.vault_source && (
                            <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                              Imported from {acc.vault_source}
                            </p>
                          )}
                          {acc.mfa && acc.mfa.type !== 'unknown' && (
                            <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                              MFA: {acc.mfa.type} ({acc.mfa.device_location})
                            </p>
                          )}
                          {acc.notes && (
                            <div className="mt-2">
                              {acc.login_method.type === 'api-key' ? (
                                <div className="flex flex-col gap-1">
                                  {acc.api_endpoint && (
                                    <p className="text-[11px] text-muted-foreground mb-1 break-all">
                                      <span className="font-semibold">Endpoint:</span> {acc.api_endpoint}
                                    </p>
                                  )}
                                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Secret API Key</span>
                                  <div className="flex items-center gap-2 bg-muted/40 rounded-md px-3 py-2 border border-border/50">
                                    <span className="text-xs font-mono break-all flex-1 select-all">
                                      {revealedKeys.has(acc.id) ? acc.notes : '••••••••••••••••••••••••••••••••'}
                                    </span>
                                    <div className="flex gap-1 shrink-0">
                                      <button 
                                        onClick={() => toggleReveal(acc.id)}
                                        className="p-1 hover:bg-muted-foreground/10 rounded text-muted-foreground transition-colors text-[10px] font-semibold"
                                      >
                                        {revealedKeys.has(acc.id) ? 'HIDE' : 'REVEAL'}
                                      </button>
                                      <button 
                                        onClick={() => handleCopy(acc.notes || '', acc.id + '-key')}
                                        className="p-1 hover:bg-muted-foreground/10 rounded text-muted-foreground transition-colors"
                                        title="Copy API Key"
                                      >
                                        {copiedId === (acc.id + '-key') ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 border border-border/50 mt-2">{acc.notes}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
