import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';
import './App.css';
import App from './App';
import Login from './Login';
import { AuthProvider, useAuth, GOOGLE_CLIENT_ID } from './auth';

// Admin-only screens, fetched the first time one is opened rather than bundled into
// the page everybody lands on. Between them they are most of the app's JavaScript, and
// a regular user never has a route that reaches either — they were paying the download
// and parse cost of code they are not allowed to run.
const ProfilesPage = lazy(() => import('./ProfilesPage'));
const AdminPage = lazy(() => import('./AdminPage'));

function NavBar() {
  const { user, isAdmin, logout } = useAuth();
  return (
    <nav className="nav-bar">
      <span className="nav-brand">Resume Updater</span>
      <div className="nav-links">
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}>
          Generate
        </NavLink>
        {isAdmin && (
          <NavLink to="/profiles" className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}>
            Manage Profiles
          </NavLink>
        )}
        {isAdmin && (
          <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}>
            Admin
          </NavLink>
        )}
      </div>
      {user && (
        <div className="nav-user">
          {user.picture && <img className="nav-user-avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />}
          <span className="nav-user-name">{user.name || user.email}</span>
          <button type="button" className="nav-logout" onClick={logout}>
            Sign out
          </button>
        </div>
      )}
    </nav>
  );
}

// Show the app only when signed in; otherwise show the Login screen.
function AuthenticatedApp() {
  const { user, ready } = useAuth();

  if (!ready) {
    return <div className="auth-loading">Loading…</div>;
  }
  if (!user) {
    return <Login />;
  }
  return (
    <BrowserRouter>
      <NavBar />
      <Suspense fallback={<div className="auth-loading">Loading…</div>}>
        <Routes>
          <Route path="/" element={<App />} />
          {/* Profiles are shared and admin-managed; regular users only select them on the Generate page. */}
          <Route path="/profiles" element={user.role === 'admin' ? <ProfilesPage /> : <Navigate to="/" replace />} />
          <Route path="/admin" element={user.role === 'admin' ? <AdminPage /> : <Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
);
