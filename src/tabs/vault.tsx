import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ThemeProvider } from 'next-themes'
import { useStorage } from '@plasmohq/storage/hook'
import { extensionStorage } from '../core/storage/config'
import { Sidebar, ViewType } from '../components/ui/Sidebar'
import { DashboardView } from '../components/views/DashboardView'
import { AtAGlanceView } from '../components/views/AtAGlanceView'
import { StatsView } from '../components/views/StatsView'
import { SettingsView } from '../components/views/SettingsView'
import { WelcomeView } from '../components/views/WelcomeView'
import { SecurityReviewView } from '../components/views/SecurityReviewView'
import { MFARegistrySection } from '../components/views/MFARegistrySection'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'
import { ToastProvider } from '../components/ui/ToastContext'
import '~/style.css'

const VALID_VIEWS: ViewType[] = [
  'at-a-glance',
  'dashboard',
  'passwords',
  'oauth',
  'mfa',
  'api-keys',
  'stats',
  'settings',
  'security-review'
]

function VaultDashboard() {
  // `isLoading` from the hook, not a `!== undefined` check on the value: the
  // default renders as `false` before storage has answered, which is
  // indistinguishable from "onboarding not done" and flashed the welcome
  // screen at returning users on every open.
  const [onboardingComplete, setOnboardingComplete, { isLoading }] =
    useStorage<boolean>(
      {
        key: 'onboarding_complete',
        instance: extensionStorage
      },
      false
    )
  const [showWelcome, setShowWelcome] = useState(false)
  const isReady = !isLoading

  const [activeView, setActiveView] = useState<ViewType>(() => {
    // Parse hash carefully — ignore query params
    const rawHash = window.location.hash.replace('#', '').split('?')[0]
    return VALID_VIEWS.includes(rawHash as ViewType)
      ? (rawHash as ViewType)
      : 'at-a-glance'
  })

  // Show welcome page if onboarding not complete, or if hash is #welcome
  useEffect(() => {
    if (!isReady) return
    const hash = window.location.hash.replace('#', '').split('?')[0]
    if (hash === 'welcome') {
      setShowWelcome(true)
      return
    }
    // If onboardingComplete is strictly false (or null if not found)
    if (onboardingComplete === false || onboardingComplete === null) {
      setShowWelcome(true)
    } else {
      setShowWelcome(false)
    }
  }, [onboardingComplete, isReady])

  useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash.replace('#', '').split('?')[0]
      if (rawHash === 'welcome') {
        setShowWelcome(true)
        return
      }
      if (VALID_VIEWS.includes(rawHash as ViewType)) {
        setShowWelcome(false)
        setActiveView(rawHash as ViewType)
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const handleSetView = (view: ViewType) => {
    setShowWelcome(false)
    setActiveView(view)
    // Replace hash without triggering reload
    history.replaceState(null, '', `#${view}`)
  }

  const handleWelcomeComplete = () => {
    setOnboardingComplete(true)
    setShowWelcome(false)
    history.replaceState(null, '', '#at-a-glance')
  }

  if (!isReady) {
    return null // Wait for hydration
  }

  if (showWelcome) {
    return <WelcomeView onComplete={handleWelcomeComplete} />
  }

  return (
    <div className="flex h-screen w-full bg-background font-sans overflow-hidden relative">
      {/* Global Animated background orbs */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <motion.div
          className="absolute -top-20 -left-20 w-[40vw] h-[40vw] max-w-lg max-h-lg rounded-full bg-indigo-500/5 blur-[100px]"
          animate={{ scale: [1, 1.2, 1], x: [0, 50, 0], y: [0, 30, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-1/4 right-0 w-[30vw] h-[30vw] max-w-md max-h-md rounded-full bg-violet-500/5 blur-[100px]"
          animate={{ scale: [1, 1.3, 1], x: [0, -40, 0], y: [0, 50, 0] }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 2
          }}
        />
        <motion.div
          className="absolute bottom-0 left-1/3 w-[35vw] h-[35vw] max-w-md max-h-md rounded-full bg-cyan-500/4 blur-[100px]"
          animate={{ scale: [1, 1.1, 1], y: [0, -30, 0] }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 4
          }}
        />
      </div>

      <Sidebar activeView={activeView} setActiveView={handleSetView} />

      <main className="flex-1 overflow-y-auto z-10 relative">
        {activeView === 'at-a-glance' && <AtAGlanceView />}
        {activeView === 'security-review' && <SecurityReviewView />}
        {activeView === 'dashboard' && <DashboardView />}
        {activeView === 'passwords' && (
          <DashboardView filterOverride="password" />
        )}
        {activeView === 'oauth' && <DashboardView filterOverride="oauth" />}
        {activeView === 'mfa' && (
          <div className="p-8 max-w-7xl mx-auto w-full pb-24">
            <MFARegistrySection />
          </div>
        )}
        {activeView === 'api-keys' && (
          <DashboardView filterOverride="api-key" />
        )}
        {activeView === 'stats' && <StatsView />}
        {activeView === 'settings' && <SettingsView />}
      </main>
    </div>
  )
}

export default function Vault() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ErrorBoundary>
        {/* Every view below reports success and failure through this. Without
            it mounted, all of that feedback goes nowhere. */}
        <ToastProvider>
          <VaultDashboard />
        </ToastProvider>
      </ErrorBoundary>
    </ThemeProvider>
  )
}
