import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';
import './App.css';
import App from './App';
import ProfilesPage from './ProfilesPage';
import AdminPage from './AdminPage';
import Login from './Login';
import { AuthProvider, useAuth, GOOGLE_CLIENT_ID } from './auth';

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
      <Routes>
        <Route path="/" element={<App />} />
        {/* Profiles are shared and admin-managed; regular users only select them on the Generate page. */}
        <Route path="/profiles" element={user.role === 'admin' ? <ProfilesPage /> : <Navigate to="/" replace />} />
        <Route path="/admin" element={user.role === 'admin' ? <AdminPage /> : <Navigate to="/" replace />} />
      </Routes>
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
