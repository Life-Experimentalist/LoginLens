import React, { useEffect, useState } from "react";
import type { PlasmoCSConfig, PlasmoGetStyle } from "plasmo";
import { useStorage } from "@plasmohq/storage/hook";
import { extensionStorage } from "../core/storage/config";
import { matchesDomain } from "../core/utils/domain";
import { safeSendMessage } from "../core/utils/runtime";
import cssText from "data-text:~/style.css";
import type { DomainEntry, IdentityProfile } from "../core/storage/schema";

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: true
};

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style");
  style.textContent = cssText;
  return style;
};

const LoginLensOverlay = () => {
  const [savedAccounts] = useStorage<DomainEntry[]>({ key: "saved_accounts", instance: extensionStorage }, []);
  const [activeInput, setActiveInput] = useState<{ rect: DOMRect, element: HTMLInputElement, isPassword: boolean } | null>(null);
  const [effectiveDomain, setEffectiveDomain] = useState<string | null>(null);

  // Auto-reload webpage in development mode if extension context is invalidated by HMR
  useEffect(() => {
    const handleDevError = (event: ErrorEvent) => {
      if (
        process.env.NODE_ENV === "development" &&
        event.message?.includes("Extension context invalidated")
      ) {
        console.info("[LoginLens Dev] Extension reloaded — refreshing tab...");
        window.location.reload();
      }
    };
    window.addEventListener("error", handleDevError);
    return () => window.removeEventListener("error", handleDevError);
  }, []);

  // On mount, ask the background service worker for the real effective domain
  useEffect(() => {
    safeSendMessage({ type: "GET_TAB_CONTEXT", tabId: undefined }, (response: any) => {
      if (response?.effectiveDomain) {
        setEffectiveDomain(response.effectiveDomain);
      } else {
        setEffectiveDomain(window.location.hostname.replace(/^www\./, ""));
      }
    });

    // Scrape OAuth Identity if we are on a known provider
    const hostname = window.location.hostname;
    let identity = null;

    if (hostname.includes("github.com")) {
      const meta = document.querySelector('meta[name="user-login"]');
      if (meta) identity = meta.getAttribute("content");
    } else if (hostname.includes("accounts.google.com")) {
      // Look for Google's data-email attribute which is often present on the account chooser
      const emailElem = document.querySelector('[data-email]');
      if (emailElem) {
        identity = emailElem.getAttribute("data-email");
      } else {
        // Fallback: look for the active logged-in email in the top right or profile card
        const emailMatch = document.body.innerText.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
        if (emailMatch) identity = emailMatch[0];
      }
    } else if (hostname.includes("microsoft.com") || hostname.includes("live.com")) {
      const emailElem = document.querySelector('.identity') || document.querySelector('[data-bind*="session.displayHint"]');
      if (emailElem) identity = emailElem.textContent?.trim();
    }

    if (identity) {
      safeSendMessage({ type: "SET_OAUTH_IDENTITY", identity });
    } else {
      // Setup a MutationObserver to catch it if it loads asynchronously
      const observer = new MutationObserver(() => {
        let asyncIdentity = null;
        if (hostname.includes("accounts.google.com")) {
          const emailElem = document.querySelector('[data-email]');
          if (emailElem) asyncIdentity = emailElem.getAttribute("data-email");
        }
        if (asyncIdentity) {
          safeSendMessage({ type: "SET_OAUTH_IDENTITY", identity: asyncIdentity });
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 10000); // Stop observing after 10s
    }
  }, []);

  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT') {
        const input = target as HTMLInputElement;
        const type = input.type.toLowerCase();
        const name = input.name.toLowerCase();
        const id = input.id.toLowerCase();
        
        const isPassword = type === 'password';
        const isUsername = type === 'text' || type === 'email';
        const hasLoginKeywords = name.includes('user') || name.includes('email') || name.includes('login') || id.includes('user') || id.includes('email');

        if (isPassword || (isUsername && hasLoginKeywords)) {
          setActiveInput({ rect: input.getBoundingClientRect(), element: input, isPassword });
        } else {
          setActiveInput(null);
        }
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName !== 'INPUT' && !(e.target as HTMLElement).closest('#loginlens-shadow')) {
        setActiveInput(null);
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('click', handleClickOutside);
    
    const handleScroll = () => setActiveInput(null);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  if (!activeInput) return null;
  if (!effectiveDomain) return null;

  // Use root-domain matching via the effective domain resolved by background tracker
  const domainData = savedAccounts?.find(d => matchesDomain(d.domain, effectiveDomain));
  
  if (!domainData || domainData.accounts.length === 0) return null;

  const topPos = activeInput.rect.bottom + window.scrollY + 5;
  const leftPos = activeInput.rect.left + window.scrollX;

  const autofill = (acc: IdentityProfile) => {
    const username = acc.identities[0];
    
    // Simulate setting value
    const setInputValue = (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    if (activeInput.isPassword) {
      // Find the preceding username field to fill if possible
      setInputValue(activeInput.element, "********"); // We don't store passwords yet per schema, so mockup
      const form = activeInput.element.closest('form');
      if (form) {
        const textInputs = Array.from(form.querySelectorAll('input[type="text"], input[type="email"]')) as HTMLInputElement[];
        if (textInputs.length > 0) {
          setInputValue(textInputs[0], username);
        }
      }
    } else {
      setInputValue(activeInput.element, username);
      // Try to find a password field in the same form
      const form = activeInput.element.closest('form');
      if (form) {
        const passInput = form.querySelector('input[type="password"]') as HTMLInputElement;
        if (passInput) {
          setInputValue(passInput, "********"); // Mock password fill
        }
      }
    }
    
    setActiveInput(null);
  };

  return (
    <div 
      id="loginlens-shadow"
      className="absolute z-[2147483647] bg-card text-card-foreground p-3 rounded-xl shadow-2xl font-sans text-sm border border-border mt-1 w-72"
      style={{ top: `${topPos}px`, left: `${leftPos}px` }}
    >
      <div className="font-semibold mb-3 flex items-center justify-between text-muted-foreground border-b border-border pb-2">
        <span>LoginLens</span>
        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{domainData.accounts.length} found</span>
      </div>
      <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
        {domainData.accounts.map((acc, idx) => (
          <div key={idx} className="flex justify-between items-center bg-muted/50 p-2 rounded-lg border border-border/50 hover:border-primary/50 transition-colors cursor-pointer group">
             <div className="truncate pr-2 flex flex-col justify-center">
               <div className="flex items-center gap-1.5 mb-0.5">
                 {acc.login_method.type === 'oauth' ? (
                   <span title="OAuth Provider" className="flex items-center justify-center bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 rounded px-1.5 py-0.5 shrink-0">
                     <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                   </span>
                 ) : (
                   <span title="Password Login" className="flex items-center justify-center bg-primary/10 text-primary border border-primary/20 rounded px-1.5 py-0.5 shrink-0">
                     <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"></path><circle cx="16.5" cy="7.5" r=".5"></circle></svg>
                   </span>
                 )}
                 <p className="font-medium truncate text-foreground">{acc.identities[0]}</p>
               </div>
               <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-semibold">
                 {acc.login_method.type === 'oauth' ? `VIA ${acc.login_method.provider}` : acc.label || 'LOCAL'}
               </p>
             </div>
             <button 
                onClick={(e) => {
                  e.preventDefault();
                  autofill(acc);
                }}
                className="px-3 py-1.5 bg-background border border-border text-foreground rounded-md font-medium group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-colors text-xs"
             >
               Use
             </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LoginLensOverlay;
