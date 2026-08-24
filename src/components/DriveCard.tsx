import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useGoogleLogin } from '@react-oauth/google';
import { HardDrive, Link2, Unlink } from 'lucide-react';
import { API_BASE_URL } from '../auth';
import { errorDetail } from '../lib/download';
import { notify } from '../lib/notify';
import type { DriveStatus } from '../types/api';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardBody, CardHeader } from './ui/card';

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
 *
 * Connecting is a precondition for generating anything: the backend rejects every
 * generate call until it is done. `onStatusChange` reports the status up so the
 * page can disable its Generate buttons instead of letting the call fail.
 */
export function DriveCard({
  onStatusChange,
}: {
  onStatusChange?: (status: DriveStatus) => void;
}) {
  const [status, setStatus] = useState<DriveStatus>({ connected: false, configured: true });
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await axios.get<DriveStatus>(`${API_BASE_URL}/api/drive/status`);
      setStatus(res.data);
      onStatusChange?.(res.data);
    } catch {
      // Non-fatal: leave the card in its default state rather than blocking the page.
    }
  }, [onStatusChange]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const connect = useGoogleLogin({
    flow: 'auth-code',
    scope: DRIVE_SCOPE,
    onSuccess: async ({ code }) => {
      setBusy(true);
      try {
        await axios.post(`${API_BASE_URL}/api/drive/connect`, { code });
        notify.success(
          'Google Drive connected.',
          'New resumes, cover letters and job descriptions will be saved there automatically.'
        );
        loadStatus();
      } catch (err) {
        notify.error(errorDetail(err, 'Could not connect Google Drive.'));
      } finally {
        setBusy(false);
      }
    },
    onError: () => notify.info('Google Drive authorization was cancelled.'),
  });

  const disconnect = async () => {
    setBusy(true);
    try {
      await axios.delete(`${API_BASE_URL}/api/drive/connect`);
      notify.info('Google Drive disconnected.', 'Files already generated are still in your Drive.');
      loadStatus();
    } catch (err) {
      notify.error(errorDetail(err, 'Could not disconnect Google Drive.'));
    } finally {
      setBusy(false);
    }
  };

  const connected = status.connected;

  return (
    <Card>
      <CardHeader
        icon={HardDrive}
        title="Google Drive"
        description={
          <>
            Every generated resume, cover letter and job description is saved to your own Drive as{' '}
            <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-fg">
              ResumeUpdater/[date]/[profile]/[Company]_[Role]/
            </code>
            . We only get access to the files this app creates — not the rest of your Drive.
          </>
        }
        actions={
          status.configured ? (
            <>
              <Badge tone={connected ? 'success' : 'warning'} dot>
                {connected ? 'Connected' : 'Not connected'}
              </Badge>
              {connected ? (
                <Button variant="secondary" size="sm" icon={Unlink} onClick={disconnect} loading={busy}>
                  Disconnect
                </Button>
              ) : (
                <Button variant="primary" size="sm" icon={Link2} onClick={() => connect()} loading={busy}>
                  Connect Drive
                </Button>
              )}
            </>
          ) : (
            <Badge tone="danger" dot>
              Not configured
            </Badge>
          )
        }
      />

      {(!status.configured || !connected) && (
        <CardBody className="pt-4">
          {!status.configured ? (
            <Alert tone="error" title="Drive is not configured on this server">
              Nothing can be generated until an administrator sets{' '}
              <code className="font-mono text-xs">GOOGLE_CLIENT_SECRET</code> in{' '}
              <code className="font-mono text-xs">backend/.env</code> and enables the Google Drive
              API for the OAuth client.
            </Alert>
          ) : (
            <Alert tone="warning" title="Drive must be connected before you can generate">
              Generation writes straight to Drive — it is also where the resume PDF is produced — so
              the Generate buttons stay disabled until you connect it.
            </Alert>
          )}
        </CardBody>
      )}
    </Card>
  );
}

export default DriveCard;
