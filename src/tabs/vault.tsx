import React, { useState, useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { Sidebar, ViewType } from "../components/ui/Sidebar";
import { DashboardView } from "../components/views/DashboardView";
import { AtAGlanceView } from "../components/views/AtAGlanceView";
import { StatsView } from "../components/views/StatsView";
import { SettingsView } from "../components/views/SettingsView";
import "../style.css";

const VALID_VIEWS: ViewType[] = ['at-a-glance', 'dashboard', 'passwords', 'oauth', 'api-keys', 'stats', 'settings'];

function VaultDashboard() {
  const [activeView, setActiveView] = useState<ViewType>(() => {
    // Parse hash carefully — ignore query params
    const rawHash = window.location.hash.replace('#', '').split('?')[0] as ViewType;
    return VALID_VIEWS.includes(rawHash) ? rawHash : 'at-a-glance';
  });

  useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash.replace('#', '').split('?')[0] as ViewType;
      if (VALID_VIEWS.includes(rawHash)) {
        setActiveView(rawHash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSetView = (view: ViewType) => {
    setActiveView(view);
    // Replace hash without triggering reload
    history.replaceState(null, '', `#${view}`);
  };

  return (
    <div className="flex h-screen w-full bg-background font-sans overflow-hidden">
      <Sidebar activeView={activeView} setActiveView={handleSetView} />
      
      <main className="flex-1 overflow-y-auto">
        {activeView === 'at-a-glance' && <AtAGlanceView />}
        {activeView === 'dashboard' && <DashboardView />}
        {activeView === 'passwords' && <DashboardView filterOverride="password" />}
        {activeView === 'oauth' && <DashboardView filterOverride="oauth" />}
        {activeView === 'api-keys' && <DashboardView filterOverride="api-key" />}
        {activeView === 'stats' && <StatsView />}
        {activeView === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}

export default function Vault() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <VaultDashboard />
    </ThemeProvider>
  );
}
