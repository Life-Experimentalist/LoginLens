import React, { useState, useEffect } from 'react';
import { useStorage } from '@plasmohq/storage/hook';
import { extensionStorage } from '../../core/storage/config';
import { WebsiteCard } from '../ui/WebsiteCard';
import { AccountModal } from '../ui/AccountModal';
import { GlobalOAuthSection } from './GlobalOAuthSection';
import type { DomainEntry, IdentityProfile, PendingOAuthCapture } from '../../core/storage/schema';
import { Search, Plus, Key, Globe, Shield, Trash2, CheckSquare, Square, ArrowDownAZ, ArrowDownZA, Clock, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type FilterType = 'all' | 'password' | 'oauth' | 'api-key';

interface DashboardViewProps {
  filterOverride?: FilterType;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ filterOverride }) => {
  const [savedAccounts, setSavedAccounts] = useStorage<DomainEntry[]>({ key: "saved_accounts", instance: extensionStorage }, []);
  const [oauthRegistry, setOauthRegistry] = useStorage<any[]>({ key: "oauth_registry", instance: extensionStorage }, []);
  const [pendingCaptures, setPendingCaptures] = useStorage<PendingOAuthCapture[]>({ key: "pending_oauth_captures", instance: extensionStorage }, []);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  // We don't update the hash from inside DashboardView to avoid
  // conflicting with the vault's top-level hash-based routing.
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<FilterType>(filterOverride || 'all');

  useEffect(() => {
    if (filterOverride) {
      setFilterType(filterOverride);
    }
  }, [filterOverride]);

  const [sortOrder, setSortOrder] = useState<'newest' | 'az' | 'za'>('newest');
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New account form state
  const [newDomain, setNewDomain] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newType, setNewType] = useState<'password' | 'oauth' | 'api-key'>('password');
  const [newProvider, setNewProvider] = useState('');
  
  // API Key specific form state
  const [newApiTitle, setNewApiTitle] = useState('');
  const [newApiEndpoint, setNewApiEndpoint] = useState('');
  const [newApiKey, setNewApiKey] = useState('');

  const selectedData = savedAccounts?.find(d => d.domain === selectedDomain);

  // Filter logic
  const filteredAccounts = savedAccounts?.filter(d => {
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery = !q || d.domain.toLowerCase().includes(q) || d.accounts.some(acc => acc.identities.some(id => id.toLowerCase().includes(q)));
    if (!matchesQuery) return false;

    if (filterType === 'password') {
      return d.accounts.some(acc => acc.login_method?.type === 'password');
    }
    if (filterType === 'oauth') {
      return d.accounts.some(acc => acc.login_method?.type === 'oauth');
    }
    if (filterType === 'api-key') {
      return d.accounts.some(acc => acc.login_method?.type === 'api-key');
    }
    return true;
  });

  const handleApprovePending = (capture: PendingOAuthCapture, finalDomain: string) => {
    // 1. Add to saved_accounts
    const updated = [...(savedAccounts || [])];
    const cleanDomain = finalDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const existingIdx = updated.findIndex(d => d.domain === cleanDomain);
    
    const profile: IdentityProfile = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
      label: `${capture.provider.split('.')[0].charAt(0).toUpperCase() + capture.provider.split('.')[0].slice(1)} OAuth`,
      identities: [capture.identity],
      login_method: { type: "oauth", provider: capture.provider },
      updated_at: Date.now(),
      notes: "Recorded during OAuth login"
    };

    if (existingIdx >= 0) {
      const already = updated[existingIdx].accounts.some(
        a => a.login_method.type === 'oauth' && a.login_method.provider === capture.provider && a.identities[0] === capture.identity
      );
      if (!already) { updated[existingIdx].accounts.push(profile); }
    } else {
      updated.push({ domain: cleanDomain, accounts: [profile] });
    }
    setSavedAccounts(updated);

    // 2. Add to linked_websites in global registry
    const newReg = [...(oauthRegistry || [])];
    const regEntry = newReg.find(r => r.provider === capture.provider && r.identity === capture.identity);
    if (regEntry) {
      regEntry.linked_websites = regEntry.linked_websites || [];
      if (!regEntry.linked_websites.includes(cleanDomain)) {
        regEntry.linked_websites.push(cleanDomain);
      }
      setOauthRegistry(newReg);
    }

    // 3. Remove from pending queue
    if (pendingCaptures) {
      setPendingCaptures(pendingCaptures.filter(p => p.id !== capture.id));
    }
  };

  const handleRejectPending = (id: string) => {
    if (pendingCaptures) {
      setPendingCaptures(pendingCaptures.filter(p => p.id !== id));
    }
  };

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (newType === 'api-key') {
      if (!newDomain.trim() || !newApiTitle.trim() || !newApiKey.trim()) {
        alert("Please enter a Domain, Title, and API Key value.");
        return;
      }
    } else {
      if (!newDomain.trim() || !newUsername.trim()) {
        alert("Please enter both a domain and a username.");
        return;
      }
    }

    const cleanDomain = newDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const newProfile: IdentityProfile = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
      label: newType === 'api-key' ? 'API Key' : 'Personal',
      identities: newType === 'api-key' ? [newApiTitle.trim()] : [newUsername.trim()],
      login_method: {
        type: newType,
        provider: newType === 'oauth' ? (newProvider.trim() || 'google.com') : undefined
      },
      api_title: newType === 'api-key' ? newApiTitle.trim() : undefined,
      api_endpoint: newType === 'api-key' ? newApiEndpoint.trim() : undefined,
      notes: newType === 'api-key' ? newApiKey.trim() : undefined,
      updated_at: Date.now()
    };

    const updated = [...(savedAccounts || [])];
    const existingIdx = updated.findIndex(d => d.domain === cleanDomain);

    if (existingIdx >= 0) {
      updated[existingIdx].accounts.push(newProfile);
    } else {
      updated.push({
        domain: cleanDomain,
        accounts: [newProfile]
      });
    }

    setSavedAccounts(updated);

    if (newType === 'oauth') {
      const newReg = [...(oauthRegistry || [])];
      const regEntry = newReg.find(r => r.provider === newProvider && r.identity === newUsername);
      if (regEntry) {
        regEntry.linked_websites = regEntry.linked_websites || [];
        if (!regEntry.linked_websites.includes(cleanDomain)) {
          regEntry.linked_websites.push(cleanDomain);
        }
        setOauthRegistry(newReg);
      }
    }
    setIsAddModalOpen(false);
    setNewDomain('');
    setNewUsername('');
    setNewProvider('');
    setNewApiTitle('');
    setNewApiEndpoint('');
    setNewApiKey('');
    alert(`Added entry for ${cleanDomain}!`);
  };

  const handleBulkDelete = () => {
    if (selectedCards.size === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedCards.size} domains?`)) {
      const updated = savedAccounts?.filter(d => !selectedCards.has(d.domain)) || [];
      setSavedAccounts(updated);
      setSelectedCards(new Set());
      setIsMultiSelect(false);
    }
  };

  const toggleSelectCard = (domain: string) => {
    const next = new Set(selectedCards);
    if (next.has(domain)) next.delete(domain);
    else next.add(domain);
    setSelectedCards(next);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto w-full pb-20">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1">
            {filterOverride === 'oauth' ? 'OAuth Registry' : filterOverride === 'password' ? 'Passwords' : filterOverride === 'api-key' ? 'API Keys' : 'All Entries'}
          </h1>
          <p className="text-muted-foreground">Manage your locally stored identities and OAuth mappings.</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg shadow hover:bg-primary/90 transition-colors self-start sm:self-auto text-sm"
        >
          <Plus size={16} /> Add New Entry
        </button>
      </div>

      {/* Pending OAuth Captures */}
      {(!filterOverride || filterOverride === 'oauth') && pendingCaptures && pendingCaptures.length > 0 && (
        <div className="mb-8 p-6 rounded-xl border border-amber-500/30 bg-amber-500/5 shadow-sm">
          <h2 className="text-lg font-bold text-amber-500 mb-4 flex items-center gap-2">
            <Clock size={20} /> Pending OAuth Captures
          </h2>
          <div className="space-y-3">
            {pendingCaptures.map(capture => {
              const suggested = capture.suggested_domain;
              return (
                <div key={capture.id} className="p-4 bg-card border border-border rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold">{capture.identity}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Globe size={14} /> via {capture.provider}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <label className="text-xs text-muted-foreground font-semibold mb-1">Target Website Domain</label>
                      <input 
                        type="text" 
                        defaultValue={suggested} 
                        id={`pending-domain-${capture.id}`}
                        className="px-3 py-1.5 bg-background border border-border rounded-md text-sm focus:outline-none focus:border-primary w-56"
                      />
                    </div>
                    <div className="flex gap-2 mt-5">
                      <button 
                        onClick={() => {
                          const input = document.getElementById(`pending-domain-${capture.id}`) as HTMLInputElement;
                          if (input) handleApprovePending(capture, input.value);
                        }}
                        className="p-2 bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded-md transition-colors"
                        title="Approve & Save"
                      >
                        <Check size={18} />
                      </button>
                      <button 
                        onClick={() => handleRejectPending(capture.id)}
                        className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-md transition-colors"
                        title="Reject & Discard"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Global OAuth Registry Section */}
      {(!filterOverride || filterOverride === 'oauth') && (
        <GlobalOAuthSection 
          oauthRegistry={oauthRegistry} 
          setOauthRegistry={setOauthRegistry}
          savedAccounts={savedAccounts}
          setSavedAccounts={setSavedAccounts}
        />
      )}

      {/* Controls Bar: Search & Category Filter */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search domains or usernames..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        
        {!filterOverride && (
          <div className="flex items-center gap-1 bg-muted p-1 rounded-lg border border-border">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                filterType === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All ({savedAccounts?.length || 0})
            </button>
            <button
              onClick={() => setFilterType('password')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                filterType === 'password' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Key size={13} /> Passwords
            </button>
            <button
              onClick={() => setFilterType('oauth')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                filterType === 'oauth' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Globe size={13} /> OAuth
            </button>
          </div>
        )}
        
        <div className="flex items-center gap-2">
          <select 
            value={sortOrder} 
            onChange={e => setSortOrder(e.target.value as any)}
            className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary transition-colors h-10"
          >
            <option value="newest">Latest Added</option>
            <option value="az">A - Z</option>
            <option value="za">Z - A</option>
          </select>
          
          <button
            onClick={() => {
              setIsMultiSelect(!isMultiSelect);
              if (isMultiSelect) setSelectedCards(new Set());
            }}
            className={`px-3 py-2 border rounded-lg text-sm transition-colors flex items-center gap-2 h-10 ${isMultiSelect ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-foreground hover:border-primary'}`}
          >
            {isMultiSelect ? <CheckSquare size={16} /> : <Square size={16} />}
            {isMultiSelect ? 'Cancel' : 'Select'}
          </button>
        </div>
      </div>

      {/* Grid of Cards */}
      {!filteredAccounts || filteredAccounts.length === 0 ? (
        <div className="text-center p-12 border border-dashed border-border rounded-xl bg-card">
          <Shield size={32} className="mx-auto mb-3 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">No matching vault entries found.</p>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery ? `No results for "${searchQuery}"` : 'Import a CSV in Settings or click "Add New Entry" above.'}
          </p>
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence>
            {filteredAccounts
              .slice()
              .sort((a, b) => {
                // First apply pin sorting
                const aPinned = a.accounts.some(acc => acc.pinned) ? 1 : 0;
                const bPinned = b.accounts.some(acc => acc.pinned) ? 1 : 0;
                if (aPinned !== bPinned) return bPinned - aPinned;
                
                // Then apply sortOrder
                if (sortOrder === 'az') return a.domain.localeCompare(b.domain);
                if (sortOrder === 'za') return b.domain.localeCompare(a.domain);
                
                // newest
                const aMax = Math.max(0, ...a.accounts.map(acc => acc.updated_at || 0));
                const bMax = Math.max(0, ...b.accounts.map(acc => acc.updated_at || 0));
                return bMax - aMax;
              })
              .map((data) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  key={data.domain}
                  className="relative"
                >
                  {isMultiSelect && (
                    <div 
                      className="absolute -top-2 -left-2 z-10 bg-background rounded-md border border-border shadow cursor-pointer"
                      onClick={() => toggleSelectCard(data.domain)}
                    >
                      <div className={`p-1 rounded-md transition-colors ${selectedCards.has(data.domain) ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                         <CheckSquare size={18} />
                      </div>
                    </div>
                  )}
                  <WebsiteCard
                    data={data}
                    onClick={() => {
                      if (isMultiSelect) toggleSelectCard(data.domain);
                      else setSelectedDomain(data.domain);
                    }}
                  />
                </motion.div>
              ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Floating Action Bar for Bulk Delete */}
      <AnimatePresence>
        {isMultiSelect && selectedCards.size > 0 && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-card border border-border shadow-2xl rounded-full px-6 py-3 flex items-center gap-6 z-50"
          >
             <span className="font-semibold text-sm">{selectedCards.size} selected</span>
             <button onClick={handleBulkDelete} className="flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-1.5 rounded-full text-sm font-medium hover:bg-destructive/90 transition-colors">
               <Trash2 size={16} /> Delete Selected
             </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Account Modal Details */}
      <AccountModal
        isOpen={!!selectedDomain}
        onClose={() => setSelectedDomain(null)}
        domain={selectedDomain || ''}
        accounts={selectedData?.accounts || []}
      />

      {/* Add New Entry Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground border border-border rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-xl font-bold border-b border-border pb-3">Add New Vault Entry</h3>
            <form onSubmit={handleAddAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Authentication Method</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setNewType('password'); setNewUsername(''); }}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${newType === 'password' ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 text-foreground border-border hover:border-primary'}`}
                  >
                    Password
                  </button>
                  <button
                    type="button"
                    onClick={() => { setNewType('oauth'); setNewUsername(''); }}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${newType === 'oauth' ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-muted/50 text-foreground border-border hover:border-indigo-500'}`}
                  >
                    OAuth / SSO
                  </button>
                  <button
                    type="button"
                    onClick={() => { setNewType('api-key'); setNewUsername(''); }}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${newType === 'api-key' ? 'bg-amber-500 text-white border-amber-500' : 'bg-muted/50 text-foreground border-border hover:border-amber-500'}`}
                  >
                    API Key
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Domain Name</label>
                <input
                  type="text"
                  placeholder="e.g. github.com or roadmap.sh"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                  required
                />
              </div>

              {newType === 'oauth' ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Provider</label>
                      <select
                        value={newProvider}
                        onChange={(e) => { setNewProvider(e.target.value); setNewUsername(''); }}
                        className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                        required
                      >
                        <option value="" disabled>Select...</option>
                        {Array.from(new Set(oauthRegistry.map(r => r.provider))).map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Account</label>
                      <select
                        value={newUsername}
                        onChange={(e) => {
                          if (e.target.value === '__add_new__') {
                            const newId = prompt('Enter new email/username for ' + newProvider);
                            if (newId) {
                              setNewUsername(newId);
                              setOauthRegistry([...oauthRegistry, { id: crypto.randomUUID?.() ?? Math.random().toString(36).substring(2), provider: newProvider, identity: newId, created_at: Date.now(), updated_at: Date.now(), is_manual: true }]);
                            }
                          } else {
                            setNewUsername(e.target.value);
                          }
                        }}
                        className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                        required
                        disabled={!newProvider}
                      >
                        <option value="" disabled>Select...</option>
                        {oauthRegistry.filter(r => r.provider === newProvider).map(acc => (
                          <option key={acc.id} value={acc.identity}>
                            {acc.identity}
                          </option>
                        ))}
                        <option value="__add_new__" className="font-semibold text-indigo-500">+ Add New Identity...</option>
                      </select>
                    </div>
                  </div>
                  {oauthRegistry.length === 0 && (
                    <p className="text-xs text-destructive mt-1">No OAuth accounts in registry. Log in via OAuth somewhere first, or add one manually in the registry.</p>
                  )}
                </>
              ) : newType === 'api-key' ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Key Title / Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Production Key, Admin Token"
                      value={newApiTitle}
                      onChange={(e) => setNewApiTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">API Key Value (Secret)</label>
                    <input
                      type="password"
                      placeholder="e.g. sk_live_..."
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                      className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Endpoint / URL (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. https://api.openai.com/v1"
                      value={newApiEndpoint}
                      onChange={(e) => setNewApiEndpoint(e.target.value)}
                      className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Username / Email</label>
                  <input
                    type="text"
                    placeholder="e.g. user@example.com"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
