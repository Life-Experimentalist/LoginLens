import React, { useState } from 'react'
import { useStorage } from '@plasmohq/storage/hook'
import { extensionStorage } from '../../core/storage/config'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield,
  Zap,
  Globe,
  Smartphone,
  Key,
  Pin,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Lock,
  RefreshCw,
  Star,
  AlertTriangle
} from 'lucide-react'
import { CSVImportModal } from '../ui/CSVImportModal'
import type { DomainEntry } from '../../core/storage/schema'
import iconStarrySkyUrl from 'url:~/assets/ui/icon-starry-sky.png'

interface WelcomeStep {
  id: string
  icon: React.ReactNode
  iconBg: string
  title: string
  subtitle: string
  body: React.ReactNode | ((onOpenImport: () => void) => React.ReactNode)
}

const steps: WelcomeStep[] = [
  {
    id: 'welcome',
    icon: <Shield size={36} />,
    iconBg: 'from-indigo-500 to-violet-600',
    title: 'Welcome to LoginLens',
    subtitle: 'Your privacy-first login tracker',
    body: (
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p>
          LoginLens is a browser extension that helps you{' '}
          <strong className="text-foreground">track and understand</strong> all
          the logins, OAuth connections, MFA configurations, and API keys you
          use across the web — without storing any passwords.
        </p>
        <div className="grid grid-cols-2 gap-3 mt-4">
          {[
            { icon: <Lock size={16} />, text: 'Zero passwords stored' },
            { icon: <Globe size={16} />, text: 'OAuth flow detection' },
            { icon: <Shield size={16} />, text: 'MFA coverage tracking' },
            { icon: <Key size={16} />, text: 'API key registry' }
          ].map((item) => (
            <div
              key={item.text}
              className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 border border-border"
            >
              <span className="text-primary">{item.icon}</span>
              <span className="text-xs font-medium text-foreground">
                {item.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    id: 'vault',
    icon: <Key size={36} />,
    iconBg: 'from-blue-500 to-cyan-500',
    title: 'The Vault',
    subtitle: 'Your local credential map',
    body: (onOpenImport: () => void) => (
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p>
          The <strong className="text-foreground">Vault Dashboard</strong> is
          your main view. Every website or app you have a login for gets a card.
          Click a card to inspect, edit, or annotate its logins.
        </p>
        <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-2">
          <p className="font-semibold text-foreground text-xs uppercase tracking-wide">
            What you can do:
          </p>
          <ul className="space-y-2 text-xs">
            <li className="flex items-start gap-2">
              <CheckCircle2
                size={14}
                className="text-green-500 shrink-0 mt-0.5"
              />
              <span>
                Import your saved passwords from Edge / Chrome / Firefox via CSV
                export
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2
                size={14}
                className="text-green-500 shrink-0 mt-0.5"
              />
              <span>
                Manually add OAuth, password, passkey, or API key entries
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2
                size={14}
                className="text-green-500 shrink-0 mt-0.5"
              />
              <span>
                Search, filter, and sort by login method or last activity
              </span>
            </li>
          </ul>
        </div>
        <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-foreground text-xs">Ready to import?</p>
            <p className="text-xs text-muted-foreground">Bulk import exported passwords now with custom label tagging.</p>
          </div>
          <button
            onClick={onOpenImport}
            className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 transition-colors shrink-0 shadow-sm"
          >
            Import Passwords CSV
          </button>
        </div>
      </div>
    )
  },
  {
    id: 'oauth',
    icon: <Globe size={36} />,
    iconBg: 'from-violet-500 to-indigo-600',
    title: 'OAuth & SSO Recording',
    subtitle: 'Automatically track "Sign in with…" logins',
    body: (
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p>
          When you log into a site using{' '}
          <strong className="text-foreground">
            Google, GitHub, Apple, or any other OAuth provider
          </strong>
          , LoginLens can detect and record that connection automatically.
        </p>
        <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-2">
          <p className="font-semibold text-foreground text-xs uppercase tracking-wide">
            How it works:
          </p>
          <ul className="space-y-2 text-xs">
            <li className="flex items-start gap-2">
              <Zap size={14} className="text-amber-500 shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">Always-Record mode:</strong>{' '}
                Enable in Settings to auto-capture all OAuth flows silently.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Zap size={14} className="text-amber-500 shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">Manual mode:</strong> Click
                "Record OAuth Login" in the popup before logging in.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Zap size={14} className="text-amber-500 shrink-0 mt-0.5" />
              <span>
                Captured logins appear in the vault under{' '}
                <strong className="text-foreground">Pending Captures</strong>{' '}
                for you to confirm.
              </span>
            </li>
          </ul>
        </div>
        <p className="text-xs p-3 bg-violet-500/5 border border-violet-500/20 rounded-lg">
          <strong className="text-violet-500">Global Registry:</strong> All your
          Google, GitHub, Microsoft accounts are stored in the OAuth Registry —
          so you can see which sites you've authorized with each identity.
        </p>
      </div>
    )
  },
  {
    id: 'mfa',
    icon: <Smartphone size={36} />,
    iconBg: 'from-green-500 to-emerald-600',
    title: 'MFA & Authenticator Apps',
    subtitle: 'Know which accounts are really protected',
    body: (
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p>
          LoginLens tracks your{' '}
          <strong className="text-foreground">
            Multi-Factor Authentication (MFA)
          </strong>{' '}
          setup so you can see at a glance which accounts have a second layer of
          protection.
        </p>
        <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-2">
          <p className="font-semibold text-foreground text-xs uppercase tracking-wide">
            Supported MFA types:
          </p>
          <ul className="space-y-2 text-xs">
            {[
              {
                label: 'Authenticator App',
                example: 'Google Authenticator, Microsoft Authenticator, Authy'
              },
              { label: 'Hardware Key', example: 'YubiKey, Titan Security Key' },
              { label: 'SMS / Email OTP', example: 'Text message, email code' },
              {
                label: 'Device Prompt',
                example: 'Google/Apple push notification'
              }
            ].map((item) => (
              <li key={item.label} className="flex flex-col">
                <span className="font-semibold text-foreground">
                  {item.label}
                </span>
                <span className="text-muted-foreground/70">{item.example}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
          <strong className="text-green-500">Link to your account:</strong> When
          adding TOTP (authenticator app) MFA, you can link it to the specific
          Google/Microsoft account the authenticator is registered under.
        </p>
      </div>
    )
  },
  {
    id: 'pinning',
    icon: <Pin size={36} />,
    iconBg: 'from-amber-500 to-orange-500',
    title: 'Smart Pinning & Auto-Pin',
    subtitle: 'Surface the right login instantly',
    body: (
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p>
          Pinning surfaces a specific login first when you open a domain.
          LoginLens also has{' '}
          <strong className="text-foreground">Auto-Pin</strong> — smart
          automation for when you only have one login for a site.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Star size={14} className="text-amber-500" />
              <span className="font-semibold text-foreground text-xs">
                Manual Pin
              </span>
              <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-500 rounded font-bold">
                HIGHEST PRIORITY
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              You explicitly pin an entry. Always shown first, regardless of
              anything else.
            </p>
          </div>
          <div className="p-3 rounded-xl bg-muted/50 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <RefreshCw size={14} className="text-muted-foreground" />
              <span className="font-semibold text-foreground text-xs">
                Auto-Pin
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              If a domain only has one login, it's automatically shown as the
              default. When you add a second login, you'll be asked which to pin
              manually.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
          <AlertTriangle size={14} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs">
            Accounts imported from multiple sources automatically get auto-pin
            applied. No action needed from you.
          </p>
        </div>
      </div>
    )
  }
]

interface WelcomeViewProps {
  onComplete: () => void
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({ onComplete }) => {
  const [, setOnboardingComplete] = useStorage<boolean>({
    key: 'onboarding_complete',
    instance: extensionStorage
  })
  const [currentStep = 0, setCurrentStep] = useStorage<number>(
    { key: 'welcome_step', instance: extensionStorage },
    0
  )

  const [savedAccounts, setSavedAccounts] = useStorage<DomainEntry[]>(
    { key: 'saved_accounts', instance: extensionStorage },
    []
  )
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  const handleComplete = async () => {
    await setOnboardingComplete(true)
    onComplete()
  }

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1)
  }

  const step = steps[currentStep]
  const isLast = currentStep === steps.length - 1

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          {/* Full icon showcase */}
          <div className="flex justify-center mb-4">
            <div className="relative">
              {/* Glow */}
              <motion.div
                className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500/50 to-violet-600/50 blur-2xl"
                animate={{ opacity: [0.4, 0.8, 0.4], scale: [1, 1.15, 1] }}
                transition={{ duration: 4, repeat: Infinity }}
              />
              {/* Animated background orbs */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
                <motion.div
                  className="absolute -top-4 -left-4 w-20 h-20 rounded-full bg-cyan-400/20 blur-xl"
                  animate={{ x: [0, 10, 0], y: [0, 8, 0] }}
                  transition={{ duration: 5, repeat: Infinity }}
                />
              </div>
              {/* Icon — full detailed version */}
              <motion.img
                src={iconStarrySkyUrl}
                alt="LoginLens"
                className="relative w-24 h-24 rounded-3xl shadow-2xl object-contain ring-1 ring-white/20"
                animate={{ y: [0, -8, 0] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }}
              />
            </div>
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
            LoginLens Setup
          </p>
          <h1 className="text-3xl font-black tracking-tight text-foreground">
            Get Started
          </h1>
        </motion.div>

        {/* Progress bar */}
        <div className="flex gap-2 mb-8">
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setCurrentStep(i)}
              className="flex-1 h-1.5 rounded-full overflow-hidden bg-muted transition-all"
            >
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{
                  width:
                    i < currentStep ? '100%' : i === currentStep ? '0%' : '0%'
                }}
                animate={{
                  width:
                    i < currentStep ? '100%' : i === currentStep ? '60%' : '0%'
                }}
                transition={{ duration: 0.4 }}
              />
            </button>
          ))}
        </div>

        {/* Step card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="rounded-2xl border border-border bg-card shadow-xl shadow-black/5 p-8 mb-6"
          >
            {/* Step icon + title */}
            <div className="flex items-start gap-5 mb-6">
              <div
                className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${step.iconBg} flex items-center justify-center text-white shadow-lg shrink-0`}
              >
                {step.icon}
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-0.5">
                  Step {currentStep + 1} of {steps.length}
                </p>
                <h2 className="text-2xl font-bold tracking-tight text-foreground mb-0.5">
                  {step.title}
                </h2>
                <p className="text-muted-foreground text-sm">{step.subtitle}</p>
              </div>
            </div>

            {/* Body content */}
            <div>
              {typeof step.body === 'function'
                ? step.body(() => setIsImportModalOpen(true))
                : step.body}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} /> Back
          </button>

          {/* Step dots */}
          <div className="flex gap-2">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={`w-2 h-2 rounded-full transition-all ${i === currentStep ? 'bg-primary w-6' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'}`}
              />
            ))}
          </div>

          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
          >
            {isLast ? (
              <>
                <CheckCircle2 size={16} /> Let's go!
              </>
            ) : (
              <>
                Next <ChevronRight size={16} />
              </>
            )}
          </button>
        </div>

        {/* Skip link */}
        {!isLast && (
          <div className="text-center mt-4">
            <button
              onClick={handleComplete}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
            >
              Skip walkthrough — I'll explore on my own
            </button>
          </div>
        )}
      </div>

      <CSVImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        savedAccounts={savedAccounts || []}
        setSavedAccounts={setSavedAccounts}
      />
    </div>
  )
}
