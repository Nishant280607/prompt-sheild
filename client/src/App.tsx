import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { LoadingState } from './components/ui/LoadingState';
import { useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const NewAnalysisPage = lazy(() => import('./pages/NewAnalysisPage'));
const UploadPage = lazy(() => import('./pages/UploadPage'));
const AnalysisProgressPage = lazy(() => import('./pages/AnalysisProgressPage'));
const AnalysisResultPage = lazy(() => import('./pages/AnalysisResultPage'));
const VulnerabilityReportPage = lazy(() => import('./pages/VulnerabilityReportPage'));
const RecommendationsPage = lazy(() => import('./pages/RecommendationsPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const PromptsPage = lazy(() => import('./pages/PromptsPage'));
const PromptVersionsPage = lazy(() => import('./pages/PromptVersionsPage'));
const VersionComparisonPage = lazy(() => import('./pages/VersionComparisonPage'));
const PdfPreviewPage = lazy(() => import('./pages/PdfPreviewPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <LoadingState fullScreen label="Restoring secure session" />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <LoadingState fullScreen label="Loading" />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<LoadingState fullScreen label="Loading Prompt Shield" />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/analyze" element={<NewAnalysisPage />} />
          <Route path="/analyze/upload" element={<UploadPage />} />
          <Route path="/analyses/:id/progress" element={<AnalysisProgressPage />} />
          <Route path="/analyses/:id" element={<AnalysisResultPage />} />
          <Route path="/analyses/:id/report" element={<VulnerabilityReportPage />} />
          <Route path="/analyses/:id/pdf" element={<PdfPreviewPage />} />
          <Route path="/recommendations" element={<RecommendationsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/prompts" element={<PromptsPage />} />
          <Route path="/prompts/:id" element={<PromptVersionsPage />} />
          <Route path="/prompts/:id/edit" element={<NewAnalysisPage />} />
          <Route path="/prompts/:id/compare" element={<VersionComparisonPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
