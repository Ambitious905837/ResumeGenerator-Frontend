import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';
import { AuthProvider, GOOGLE_CLIENT_ID, useAuth } from './auth';
import { ThemeProvider } from './theme';
import { AppShell } from './components/AppShell';
import { TooltipProvider } from './components/ui/tooltip';
import { Toaster } from './components/ui/toaster';
import { Spinner } from './components/ui/spinner';
import GeneratePage from './pages/GeneratePage';
import LoginPage from './pages/LoginPage';

// Admin-only screens, fetched the first time one is opened rather than bundled into
// the page everybody lands on. Between them they are most of the app's JavaScript, and
// a regular user never has a route that reaches either — they were paying the download
// and parse cost of code they are not allowed to run.
const ProfilesPage = lazy(() => import('./pages/ProfilesPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted">
      <Spinner className="h-5 w-5" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/** Show the app only when signed in; otherwise show the login screen. */
function AuthenticatedApp() {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <div className="min-h-screen bg-bg">
        <FullPageLoader label="Checking your session…" />
      </div>
    );
  }
  if (!user) return <LoginPage />;

  const isAdmin = user.role === 'admin';

  return (
    <BrowserRouter>
      <AppShell>
        <Suspense fallback={<FullPageLoader />}>
          <Routes>
            <Route path="/" element={<GeneratePage />} />
            {/* Profiles are shared and admin-managed; regular users only select them on
                the Generate page. */}
            <Route path="/profiles" element={isAdmin ? <ProfilesPage /> : <Navigate to="/" replace />} />
            <Route path="/admin" element={isAdmin ? <AdminPage /> : <Navigate to="/" replace />} />
            {/* An unknown path is a stale bookmark, not an error worth a screen. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
    </BrowserRouter>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <ThemeProvider>
      <TooltipProvider delayDuration={200} skipDelayDuration={300}>
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          <AuthProvider>
            <AuthenticatedApp />
            <Toaster />
          </AuthProvider>
        </GoogleOAuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>
);
