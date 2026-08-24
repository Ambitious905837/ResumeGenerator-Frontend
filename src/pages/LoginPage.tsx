import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { CheckCircle2, FileSignature, HardDrive, Sparkles } from 'lucide-react';
import { useAuth, GOOGLE_CLIENT_ID } from '../auth';
import { errorDetail } from '../lib/download';
import { Alert } from '../components/ui/alert';
import { Spinner } from '../components/ui/spinner';
import { ThemeToggle } from '../components/ThemeToggle';
import { useTheme } from '../theme';

const POINTS = [
  { icon: Sparkles, text: 'A tailored resume and cover letter for every job link you paste.' },
  { icon: HardDrive, text: 'Everything saved straight to your own Google Drive, organised by company and role.' },
  { icon: CheckCircle2, text: 'One history of everything generated, downloadable as a ZIP whenever you need it.' },
];

export default function LoginPage() {
  const { loginWithGoogle } = useAuth();
  const { resolved } = useTheme();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const configured = !!GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith('your-google-client-id');

  const handleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) {
      setError('Google did not return a credential. Please try again.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await loginWithGoogle(credentialResponse.credential);
      // On success the app re-renders into the authenticated view automatically.
    } catch (err) {
      setError(errorDetail(err, 'Sign-in failed. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4 py-10">
      {/* Two soft colour washes behind the card. Purely decorative, and kept out of the
          accessibility tree so a screen reader never announces them. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-brand/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -right-32 h-[26rem] w-[26rem] rounded-full bg-info/15 blur-3xl"
      />

      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="relative grid w-full max-w-4xl items-center gap-10 md:grid-cols-2">
        <div className="hidden md:block">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-brand-fg shadow-sm">
              <FileSignature className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-fg">Resume Updater</span>
          </div>
          <h1 className="mt-6 text-3xl font-semibold leading-tight tracking-tight text-fg">
            Every application, tailored — without the copy-paste.
          </h1>
          <ul className="mt-7 space-y-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3 text-sm leading-relaxed text-muted">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-7 shadow-lg">
          <div className="mb-6 text-center md:text-left">
            <h2 className="text-lg font-semibold tracking-tight text-fg">Sign in</h2>
            <p className="mt-1.5 text-sm text-muted">
              Use the Google account whose Drive should hold your generated documents.
            </p>
          </div>

          {!configured && (
            <Alert tone="error" title="Google sign-in is not configured">
              Set <code className="font-mono text-xs">REACT_APP_GOOGLE_CLIENT_ID</code> in{' '}
              <code className="font-mono text-xs">frontend/.env</code> and restart the dev server.
            </Alert>
          )}

          {configured && (
            <div className="flex justify-center">
              {/* Google renders this button in its own iframe, so it cannot inherit the
                  app's theme tokens — it is told which scheme to draw instead. */}
              <GoogleLogin
                key={resolved}
                onSuccess={handleSuccess}
                onError={() => setError('Google sign-in was cancelled or failed.')}
                useOneTap={false}
                text="continue_with"
                shape="pill"
                size="large"
                theme={resolved === 'dark' ? 'filled_black' : 'outline'}
              />
            </div>
          )}

          {busy && (
            <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
              <Spinner /> Signing you in…
            </p>
          )}

          {error && (
            <Alert tone="error" className="mt-4">
              {error}
            </Alert>
          )}

          <p className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-subtle">
            By continuing you agree to let this app read your basic Google profile (name, email,
            picture). Drive access is a separate step you can grant — and revoke — after signing in.
          </p>
        </div>
      </div>
    </div>
  );
}
