import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth, GOOGLE_CLIENT_ID } from './auth';

function Login() {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSuccess = async (credentialResponse) => {
    setError('');
    setBusy(true);
    try {
      await loginWithGoogle(credentialResponse.credential);
      // On success the app re-renders into the authenticated view automatically.
    } catch (err) {
      const detail =
        (err && err.response && err.response.data && err.response.data.detail) ||
        (err && err.message) ||
        'Sign-in failed. Please try again.';
      setError(String(detail));
    } finally {
      setBusy(false);
    }
  };

  const configured = GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith('your-google-client-id');

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-title">Resume Updater</h1>
        <p className="login-subtitle">Sign in with Google to generate tailored resumes and cover letters.</p>

        {!configured && (
          <div className="login-error">
            Google sign-in is not configured. Set <code>REACT_APP_GOOGLE_CLIENT_ID</code> in{' '}
            <code>frontend/.env</code> and restart the dev server.
          </div>
        )}

        {configured && (
          <div className="login-google">
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={() => setError('Google sign-in was cancelled or failed.')}
              useOneTap={false}
              text="continue_with"
              shape="pill"
              size="large"
            />
          </div>
        )}

        {busy && <p className="login-hint">Signing you in…</p>}
        {error && <div className="login-error">{error}</div>}

        <p className="login-legal">
          By continuing you agree to let this app read your basic Google profile (name, email, picture).
        </p>
      </div>
    </div>
  );
}

export default Login;
