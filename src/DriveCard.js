import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useGoogleLogin } from '@react-oauth/google';
import { API_BASE_URL } from './auth';

// Narrowest scope that lets us write: grants access only to files this app creates,
// so we can never read the rest of the user's Drive.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * Connect / disconnect the signed-in user's Google Drive.
 *
 * Signing in gives us only an ID token, which cannot write to Drive — so this is a
 * separate consent step using the authorization-code (popup) flow. The code goes
 * straight to the backend, which exchanges it for a refresh token; the browser
 * never holds a Drive token.
 *
 * Once connected, every generated resume, cover letter and job description is
 * mirrored to ResumeUpdater/<date>/<profile>/<Company_Role>/ in their Drive.
 */
function DriveCard() {
  const [status, setStatus] = useState({ connected: false, configured: true });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const loadStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/drive/status`);
      setStatus(res.data);
    } catch {
      // Non-fatal: leave the card in its default state rather than blocking the page.
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const connect = useGoogleLogin({
    flow: 'auth-code',
    scope: DRIVE_SCOPE,
    onSuccess: async ({ code }) => {
      setBusy(true);
      setMessage({ type: '', text: '' });
      try {
        await axios.post(`${API_BASE_URL}/api/drive/connect`, { code });
        setMessage({ type: 'success', text: 'Google Drive connected. New resumes will be saved there automatically.' });
        loadStatus();
      } catch (err) {
        setMessage({ type: 'error', text: err.response?.data?.detail || 'Could not connect Google Drive.' });
      } finally {
        setBusy(false);
      }
    },
    onError: () => setMessage({ type: 'error', text: 'Google Drive authorization was cancelled.' }),
  });

  const disconnect = async () => {
    setBusy(true);
    setMessage({ type: '', text: '' });
    try {
      await axios.delete(`${API_BASE_URL}/api/drive/connect`);
      setMessage({ type: 'info', text: 'Google Drive disconnected. Files are still saved on the server.' });
      loadStatus();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Could not disconnect Google Drive.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2 className="section-title">Google Drive</h2>
      <p className="section-desc">
        Save every generated resume, cover letter and job description to your own Google Drive, in the same
        structure we use on the server: <code>ResumeUpdater/[date]/[profile]/[Company]_[Role]/</code>. We only
        get access to the files this app creates — not the rest of your Drive.
      </p>

      {message.text && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      {!status.configured ? (
        <div className="alert alert-info">
          Google Drive isn’t configured on the server. An admin needs to set <code>GOOGLE_CLIENT_SECRET</code> in{' '}
          <code>backend/.env</code> and enable the Google Drive API for the OAuth client.
        </div>
      ) : status.connected ? (
        <div className="drive-status">
          <span className="badge badge-custom">Connected</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={disconnect} disabled={busy}>
            {busy ? 'Working…' : 'Disconnect Drive'}
          </button>
        </div>
      ) : (
        <div className="drive-status">
          <span className="badge badge-builtin">Not connected</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => connect()} disabled={busy}>
            {busy ? 'Connecting…' : 'Connect Google Drive'}
          </button>
        </div>
      )}
    </div>
  );
}

export default DriveCard;
