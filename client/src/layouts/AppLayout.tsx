import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Sidebar } from '../components/navigation/Sidebar';
import { Topbar } from '../components/navigation/Topbar';
import { dashboardService } from '../services/analysisService';
import type { AIStatus } from '../types/api';

/** Authenticated shell: collapsible sidebar, top bar and routed content. */
export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const location = useLocation();

  useEffect(() => {
    dashboardService
      .systemStatus()
      .then((status) => setAiStatus(status.analysisMode))
      .catch(() => setAiStatus(null));
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="noise relative min-h-screen">
      <div className="grid-backdrop pointer-events-none fixed inset-0 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" aria-hidden="true" />
      <a href="#main" className="sr-only z-50 rounded-lg bg-accent px-3 py-2 text-ink-950 focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} aiStatus={aiStatus} />
      <div className="relative lg:pl-68">
        <Topbar onMenu={() => setSidebarOpen(true)} aiStatus={aiStatus} />
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
