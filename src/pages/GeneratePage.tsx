import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  Download,
  ExternalLink,
  FileDown,
  FileText,
  Link as LinkIcon,
  Package,
  Sparkles,
  UserRound,
  Wand2,
} from 'lucide-react';
import { API_BASE_URL } from '../auth';
import { blobErrorDetail, errorDetail, safeFileName, saveBlob } from '../lib/download';
import { notify } from '../lib/notify';
import { plural } from '../lib/format';
import { cn } from '../lib/cn';
import type {
  DriveOutcome,
  DriveStatus,
  GenerationResult,
  JobDescriptionListing,
  JobDescriptionResult,
  JobLinkResult,
  ScrapeResult,
  TxtConversionResult,
} from '../types/api';
import { PageHeader } from '../components/AppShell';
import { DriveCard } from '../components/DriveCard';
import { HistoryPanel } from '../components/HistoryPanel';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardBody, CardHeader, SectionHeading } from '../components/ui/card';
import { Dropzone } from '../components/ui/dropzone';
import { Field, Select, Textarea } from '../components/ui/field';
import { ProgressBar } from '../components/ui/feedback';
import { HintWrap } from '../components/ui/tooltip';

interface Progress {
  current: number;
  total: number;
  status: string;
}

const NO_PROGRESS: Progress = { current: 0, total: 0, status: '' };

/** Job links, one per line or comma-separated. Anything that isn't a URL is dropped. */
function parseLinks(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && (s.startsWith('http://') || s.startsWith('https://')));
}

/**
 * Google Drive outcome for a TXT conversion. Renders nothing when Drive isn't
 * connected — that's the normal state, not a problem.
 */
function DriveNote({ drive }: { drive?: DriveOutcome | null }) {
  if (!drive || !drive.connected) return null;
  if (drive.synced) {
    return (
      <a
        className="inline-flex items-center gap-1 text-xs text-success-fg hover:underline"
        href={drive.folder_link}
        target="_blank"
        rel="noopener noreferrer"
      >
        Saved to Drive
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    );
  }
  return <span className="text-xs text-danger-fg">Not saved to Drive: {drive.error}</span>;
}

/**
 * The jobs that failed in the last run, and why.
 *
 * Successes deliberately aren't listed: they show up in the Generated resumes table,
 * which is the single place resumes are found and downloaded. A failure has no row
 * there, so it would otherwise vanish without explanation.
 */
function GenerationFailures<T extends GenerationResult>({
  results,
  label,
}: {
  results: T[];
  label: (result: T) => string;
}) {
  const failed = results.filter((r) => !r.success);
  if (failed.length === 0) return null;
  return (
    <div className="space-y-2">
      <SectionHeading className="mb-0">
        <span className="inline-flex items-center gap-1.5 text-danger-fg">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          Could not generate ({failed.length})
        </span>
      </SectionHeading>
      <ul className="space-y-1.5">
        {failed.map((result, i) => (
          <li
            key={i}
            className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm"
          >
            <div className="break-all font-medium text-danger-fg">{label(result)}</div>
            <div className="mt-0.5 text-xs leading-relaxed text-danger-fg/80">{result.error}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function GeneratePage() {
  // --- Profiles -------------------------------------------------------------
  // Profiles come from the server and are per-user: an admin decides which candidate
  // profiles this account may use. Until they load we assume none, so we never show a
  // profile the user isn't allowed to generate with.
  const [candidateName, setCandidateName] = useState('');
  const [profileOptions, setProfileOptions] = useState<string[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);

  // --- Job links ------------------------------------------------------------
  const [jobLinksText, setJobLinksText] = useState('');
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [progress, setProgress] = useState<Progress>(NO_PROGRESS);
  // Only the failures of the last run are kept. Successes don't need their own list:
  // they land in the history table above, which is the one place files live.
  const [results, setResults] = useState<JobLinkResult[]>([]);
  const [scrapeSummary, setScrapeSummary] = useState<ScrapeResult[]>([]);

  // --- ResumeGPT + job-description files ------------------------------------
  const [resumegptFiles, setResumegptFiles] = useState<File[]>([]);
  const [jdFiles, setJdFiles] = useState<File[]>([]);
  const [jdList, setJdList] = useState<JobDescriptionListing>({
    job_descriptions: [],
    count: 0,
    has_resumegpt: false,
  });
  const [jdLoading, setJdLoading] = useState(false);
  const [jdProgress, setJdProgress] = useState<Progress>(NO_PROGRESS);
  const [jdResults, setJdResults] = useState<JobDescriptionResult[]>([]);

  // --- TXT to DOCX ----------------------------------------------------------
  const [txtFiles, setTxtFiles] = useState<File[]>([]);
  const [txtUploading, setTxtUploading] = useState(false);
  const [txtResults, setTxtResults] = useState<TxtConversionResult[]>([]);

  // --- Drive ----------------------------------------------------------------
  // Reported up by DriveCard. `loaded` stays false until the first /api/drive/status
  // answer, so we don't flash "not connected" at a user who is connected.
  const [driveStatus, setDriveStatus] = useState<DriveStatus & { loaded: boolean }>({
    connected: false,
    configured: true,
    loaded: false,
  });

  // Bumped after any successful generation so the history panel pulls the new rows in.
  const [historySignal, setHistorySignal] = useState(0);
  const refreshHistory = () => setHistorySignal((n) => n + 1);

  const links = useMemo(() => parseLinks(jobLinksText), [jobLinksText]);

  // Stable identity: DriveCard fetches on a callback that depends on this one.
  const handleDriveStatus = useCallback((status: DriveStatus) => {
    setDriveStatus({ ...status, loaded: true });
  }, []);

  // Generating requires a connected Google Drive — that is where every generated file
  // is saved and where the resume PDF is made. The backend rejects generate calls
  // without it (409); this mirrors the rule in the UI so the buttons say so up front.
  const driveBlocked = !driveStatus.connected;
  const driveBlockedText =
    driveStatus.configured === false
      ? 'Google Drive is not configured on this server, so nothing can be generated. Ask an administrator to finish the setup.'
      : 'Connect your Google Drive above to generate. Every generated resume, cover letter and job description is saved there.';

  // No profile assigned (or the admin revoked them all) — nothing here can be generated.
  const noProfileAssigned = profilesLoaded && profileOptions.length === 0;
  const busy = loading || scraping || jdLoading;

  const loadJdList = useCallback(async () => {
    try {
      const res = await axios.get<JobDescriptionListing>(`${API_BASE_URL}/api/job-descriptions`);
      setJdList({
        job_descriptions: res.data.job_descriptions || [],
        count: res.data.count || 0,
        has_resumegpt: res.data.has_resumegpt || false,
      });
    } catch {
      setJdList({ job_descriptions: [], count: 0, has_resumegpt: false });
    }
  }, []);

  useEffect(() => {
    axios
      .get<{ profiles?: string[] }>(`${API_BASE_URL}/api/profiles`)
      .then((res) => {
        const names = res.data?.profiles || [];
        setProfileOptions(names);
        // Select the first assigned profile; nothing to select when none are assigned.
        setCandidateName((current) => (current && names.includes(current) ? current : names[0] || ''));
      })
      .catch(() => {
        setProfileOptions([]);
        setCandidateName('');
      })
      .finally(() => setProfilesLoaded(true));
  }, []);

  // Pick up the session the server remembers for this account. The job links and the
  // uploaded job-description files are stored per user on the backend and survive both a
  // page reload and a backend restart, so a crash partway through a batch no longer means
  // pasting fifty links again. Anything already typed into the box wins over the restore.
  useEffect(() => {
    axios
      .get<{ jobs?: Array<{ url?: string }> }>(`${API_BASE_URL}/api/jobs`)
      .then((res) => {
        const urls = (res.data?.jobs || []).map((j) => j.url).filter(Boolean) as string[];
        if (urls.length) setJobLinksText((current) => (current.trim() ? current : urls.join('\n')));
      })
      .catch(() => {});
    loadJdList();
  }, [loadJdList]);

  // --- Actions --------------------------------------------------------------

  const scrapeAll = async () => {
    if (links.length === 0) {
      notify.error('Paste at least one job link first.', 'One per line, or comma-separated.');
      return;
    }
    setScrapeSummary([]);
    setScraping(true);
    try {
      await axios.post(`${API_BASE_URL}/api/upload-job-urls`, { urls: links });
      const res = await axios.post<{
        results?: ScrapeResult[];
        success_count?: number;
        total?: number;
        message?: string;
      }>(`${API_BASE_URL}/api/scrape-job-urls`, { candidate_name: candidateName.trim() });
      const scraped = res.data.results || [];
      setScrapeSummary(scraped);
      const succeeded = res.data.success_count ?? scraped.filter((r) => r.success).length;
      const total = res.data.total ?? links.length;
      const description = res.data.message || 'Saved to job_descriptions/{profile}/{date}/.';
      if (succeeded === total) notify.success(`Scraped all ${total} ${plural(total, 'job')}.`, description);
      else if (succeeded > 0) notify.warning(`Scraped ${succeeded} of ${total}.`, description);
      else notify.error('Could not scrape any of those links.', description);
    } catch (err) {
      notify.error(errorDetail(err, 'Scrape failed.'));
    } finally {
      setScraping(false);
    }
  };

  const generateAll = async () => {
    if (links.length === 0) {
      notify.error('Paste at least one job link first.', 'One per line, or comma-separated.');
      return;
    }
    if (driveBlocked) {
      notify.error('Google Drive is not connected.', driveBlockedText);
      return;
    }

    setResults([]);
    setLoading(true);

    try {
      await axios.post(`${API_BASE_URL}/api/upload-job-urls`, { urls: links });
      const total = links.length;
      const resultList: JobLinkResult[] = [];

      // Deliberately sequential: each job is a model call plus a set of Drive uploads,
      // and firing them all at once is what gets the account rate-limited.
      for (let jobIndex = 0; jobIndex < total; jobIndex++) {
        setProgress({
          current: jobIndex + 1,
          total,
          status: `Generating resume & cover letter for job ${jobIndex + 1} of ${total}…`,
        });

        try {
          const response = await axios.post<{
            folder_name?: string;
            has_pdf?: boolean;
            resume_pdf_error?: string | null;
            drive?: DriveOutcome | null;
          }>(`${API_BASE_URL}/api/generate-resume/${jobIndex}`, {
            candidate_name: candidateName.trim(),
          });
          resultList.push({
            jobIndex,
            url: links[jobIndex],
            success: true,
            folderName: response.data.folder_name,
            hasPdf: !!response.data.has_pdf,
            resumePdfError: response.data.resume_pdf_error || null,
            drive: response.data.drive || null,
          });
        } catch (err) {
          resultList.push({
            jobIndex,
            url: links[jobIndex],
            success: false,
            error: errorDetail(err, 'Failed to generate'),
          });
        }
      }

      setResults(resultList);
      const succeeded = resultList.filter((r) => r.success).length;
      if (succeeded > 0) refreshHistory();
      notify.batch(succeeded, total, plural(total, 'resume'), 'Find them in Generated resumes above.');
    } catch (err) {
      notify.error(errorDetail(err, 'Error uploading job URLs or generating resumes.'));
    } finally {
      setLoading(false);
      setProgress(NO_PROGRESS);
    }
  };

  const uploadResumegptAndJds = async () => {
    if (!jdFiles.length) {
      notify.error('Select at least one job description .txt file.');
      return;
    }
    setJdLoading(true);
    setJdResults([]);
    try {
      const resumegptFile = resumegptFiles[0];
      if (resumegptFile) {
        const fd = new FormData();
        fd.append('file', resumegptFile);
        await axios.post(`${API_BASE_URL}/api/upload-resumegpt`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      const fd = new FormData();
      jdFiles.forEach((f) => fd.append('files', f));
      await axios.post(`${API_BASE_URL}/api/upload-job-descriptions`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadJdList();
      notify.success(
        `Uploaded ${jdFiles.length} job ${plural(jdFiles.length, 'description')}${resumegptFile ? ' and a custom ResumeGPT prompt' : ''}.`,
        'Now click Generate below.'
      );
      setResumegptFiles([]);
      setJdFiles([]);
    } catch (err) {
      notify.error(errorDetail(err, 'Upload failed.'));
    } finally {
      setJdLoading(false);
    }
  };

  const generateFromJdAll = async () => {
    if (!jdList.count) {
      notify.error('Upload job descriptions first.');
      return;
    }
    if (driveBlocked) {
      notify.error('Google Drive is not connected.', driveBlockedText);
      return;
    }
    setJdLoading(true);
    setJdResults([]);
    const total = jdList.count;
    const resultList: JobDescriptionResult[] = [];
    for (let i = 0; i < total; i++) {
      setJdProgress({ current: i + 1, total, status: `Generating for job ${i + 1} of ${total}…` });
      try {
        const res = await axios.post<{
          folder_name?: string;
          has_pdf?: boolean;
          resume_pdf_error?: string | null;
          drive?: DriveOutcome | null;
        }>(`${API_BASE_URL}/api/generate-from-job-description/${i}`, {
          candidate_name: candidateName.trim(),
        });
        resultList.push({
          jdIndex: i,
          filename: jdList.job_descriptions[i]?.filename,
          success: true,
          folderName: res.data.folder_name,
          hasPdf: !!res.data.has_pdf,
          resumePdfError: res.data.resume_pdf_error || null,
          drive: res.data.drive || null,
        });
      } catch (err) {
        resultList.push({
          jdIndex: i,
          filename: jdList.job_descriptions[i]?.filename,
          success: false,
          error: errorDetail(err, 'Failed'),
        });
      }
    }
    setJdProgress(NO_PROGRESS);
    setJdResults(resultList);
    const succeeded = resultList.filter((r) => r.success).length;
    if (succeeded > 0) refreshHistory();
    notify.batch(succeeded, total, plural(total, 'resume'), 'Find them in Generated resumes above.');
    setJdLoading(false);
  };

  const convertTxtToDocx = async () => {
    if (!txtFiles.length) {
      notify.error('Select one or more .txt files first.');
      return;
    }
    if (driveBlocked) {
      notify.error('Google Drive is not connected.', driveBlockedText);
      return;
    }
    setTxtUploading(true);
    try {
      const formData = new FormData();
      txtFiles.forEach((file) => formData.append('files', file));
      if (candidateName.trim()) formData.append('candidate_name', candidateName.trim());
      const response = await axios.post<{ results?: TxtConversionResult[] }>(
        `${API_BASE_URL}/api/upload-resume-txt`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      const converted = response.data.results || [];
      setTxtResults(converted);
      const succeeded = converted.filter((r) => r.success).length;
      const total = converted.length;
      if (succeeded === total) {
        notify.success(
          `Converted all ${total} ${plural(total, 'file')}.`,
          'Download the Resume and Cover Letter documents below.'
        );
      } else if (succeeded > 0) {
        notify.warning(`Converted ${succeeded} of ${total} ${plural(total, 'file')}.`);
      } else {
        notify.error('None of those files could be converted.');
      }
    } catch (err) {
      notify.error(errorDetail(err, 'Failed to convert files.'));
    } finally {
      setTxtUploading(false);
    }
  };

  /** ZIP one TXT conversion's output. The TXT flow isn't part of resume history. */
  const downloadBundle = async (uploadId: string, folderName: string) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/download/uploaded/bundle/${uploadId}`,
        { responseType: 'blob' }
      );
      saveBlob(response.data, `${safeFileName(folderName, 'generated_files')}.zip`);
    } catch (err) {
      notify.error(await blobErrorDetail(err, 'Error downloading ZIP'));
    }
  };

  const downloadUploadedDoc = async (
    uploadId: string | undefined,
    type: 'resume' | 'resume-pdf' | 'cover-letter',
    baseName?: string
  ) => {
    if (!uploadId) return;
    const path =
      type === 'resume'
        ? `/api/download/uploaded/resume/${uploadId}`
        : type === 'resume-pdf'
          ? `/api/download/uploaded/resume-pdf/${uploadId}`
          : `/api/download/uploaded/cover-letter/${uploadId}`;
    const ext = type === 'resume' ? 'Resume.docx' : type === 'resume-pdf' ? 'Resume.pdf' : 'Cover Letter.docx';
    try {
      const response = await axios.get(`${API_BASE_URL}${path}`, { responseType: 'blob' });
      saveBlob(response.data, baseName ? `${safeFileName(baseName)}_${ext}` : ext);
    } catch (err) {
      notify.error(await blobErrorDetail(err, 'Error downloading file'));
    }
  };

  // --- Render ---------------------------------------------------------------

  const jdBlockedReason = noProfileAssigned
    ? 'No candidate profile is assigned to your account.'
    : driveBlocked
      ? driveBlockedText
      : undefined;

  const generateBlockedReason = noProfileAssigned
    ? 'No candidate profile is assigned to your account.'
    : driveBlocked
      ? driveBlockedText
      : links.length === 0
        ? 'Paste at least one job link above.'
        : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Generate resumes & cover letters"
        description="Paste job links or upload job descriptions. Each one becomes a tailored resume and cover letter, filed by company and role in your Google Drive."
      />

      {/* Connect Google Drive so generated files are mirrored there automatically.
          It is also a hard precondition for generating — see driveBlocked. */}
      <DriveCard onStatusChange={handleDriveStatus} />

      {/* The one table; also the only place downloads happen. */}
      <HistoryPanel candidateName={candidateName} reloadSignal={historySignal} />

      <Card>
        <CardHeader
          icon={Wand2}
          title="New generation"
          description="Pick the profile to write as, then give it work: a list of job links to scrape and generate from, or job description files you already have."
          actions={
            candidateName ? (
              <Badge tone="brand">
                <UserRound className="h-3 w-3" />
                {candidateName}
              </Badge>
            ) : null
          }
        />
        <CardBody className="space-y-6">
          {noProfileAssigned ? (
            <Alert tone="error" title="No candidate profile assigned">
              Ask your administrator to assign one to your account — a resume cannot be written
              without a profile to write it from.
            </Alert>
          ) : (
            <Field
              label="Candidate profile"
              hint={
                candidateName
                  ? `Used for the resume content and the file name — saved as ${candidateName}.docx.`
                  : 'Used for the resume content and the file name.'
              }
              htmlFor="candidate-profile"
              className="max-w-md"
            >
              <Select
                id="candidate-profile"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                disabled={busy || !profilesLoaded}
              >
                {!profilesLoaded && <option value="">Loading profiles…</option>}
                {profileOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {driveStatus.loaded && driveBlocked && (
            <Alert tone="warning" title="Google Drive is not connected">
              {driveBlockedText}
            </Alert>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* --- From job links --- */}
            <div className="space-y-4 rounded-xl border border-border bg-surface-2/40 p-4">
              <SectionHeading hint="We scrape each posting, then write a resume and cover letter against it.">
                <span className="inline-flex items-center gap-1.5">
                  <LinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  From job links
                </span>
              </SectionHeading>

              <Field
                htmlFor="job-links"
                hint={
                  jobLinksText.trim()
                    ? `${links.length} valid ${plural(links.length, 'link')} detected. Lines that aren't http(s) URLs are ignored.`
                    : 'One per line, or comma-separated.'
                }
              >
                <Textarea
                  id="job-links"
                  rows={8}
                  className="font-mono text-xs"
                  placeholder={'https://example.com/jobs/123\nhttps://example.com/jobs/456'}
                  value={jobLinksText}
                  onChange={(e) => setJobLinksText(e.target.value)}
                  disabled={loading}
                />
              </Field>

              <div className="flex flex-wrap gap-2">
                {/* Scraping only saves job descriptions — it costs nothing and needs no Drive. */}
                <Button
                  variant="secondary"
                  icon={FileDown}
                  onClick={scrapeAll}
                  loading={scraping}
                  disabled={busy || !candidateName || links.length === 0}
                >
                  Scrape only
                </Button>
                <HintWrap hint={generateBlockedReason} disabled={!!generateBlockedReason}>
                  <Button
                    variant="primary"
                    icon={Sparkles}
                    onClick={generateAll}
                    loading={loading}
                    disabled={busy || !candidateName || driveBlocked || links.length === 0}
                  >
                    Generate{links.length > 0 ? ` ${links.length}` : ''}
                  </Button>
                </HintWrap>
              </div>

              {loading && progress.total > 0 && (
                <ProgressBar
                  current={progress.current}
                  total={progress.total}
                  label={progress.status}
                />
              )}

              {scrapeSummary.length > 0 && !scraping && (
                <p className="text-xs text-muted">
                  Last scrape: {scrapeSummary.filter((r) => r.success).length}/{scrapeSummary.length}{' '}
                  job {plural(scrapeSummary.length, 'description')} saved.
                </p>
              )}

              <GenerationFailures
                results={results}
                label={(r) => `Job ${r.jobIndex + 1}: ${r.url}`}
              />
            </div>

            {/* --- From job description files --- */}
            <div className="space-y-4 rounded-xl border border-border bg-surface-2/40 p-4">
              <SectionHeading hint="Already have the postings saved? Upload them and skip the scrape.">
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  From job description files
                </span>
              </SectionHeading>

              <Dropzone
                files={jdFiles}
                onFilesChange={setJdFiles}
                disabled={jdLoading}
                label="Job description .txt files"
                hint="Drag them here, or click to browse (.txt)"
              />

              <Dropzone
                files={resumegptFiles}
                onFilesChange={setResumegptFiles}
                multiple={false}
                disabled={jdLoading}
                label="ResumeGPT prompt (optional)"
                hint={
                  jdList.has_resumegpt
                    ? 'A custom prompt is already loaded — upload another to replace it.'
                    : 'Leave empty to use the default prompt.'
                }
              />

              <Button
                variant="secondary"
                icon={Package}
                onClick={uploadResumegptAndJds}
                loading={jdLoading && jdFiles.length > 0}
                disabled={jdLoading || !jdFiles.length}
              >
                Upload {jdFiles.length > 0 ? `${jdFiles.length} ${plural(jdFiles.length, 'file')}` : 'files'}
              </Button>

              {jdList.count > 0 && (
                <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
                  <p className="text-sm text-fg">
                    <span className="font-medium">
                      {jdList.count} job {plural(jdList.count, 'description')} ready
                    </span>
                    <span className="text-muted">
                      {' '}
                      · {jdList.has_resumegpt ? 'custom ResumeGPT loaded' : 'using the default ResumeGPT'}
                    </span>
                  </p>
                  <HintWrap hint={jdBlockedReason} disabled={!!jdBlockedReason}>
                    <Button
                      variant="primary"
                      icon={Sparkles}
                      onClick={generateFromJdAll}
                      loading={jdLoading && jdProgress.total > 0}
                      disabled={busy || !candidateName || driveBlocked}
                    >
                      Generate all {jdList.count}
                    </Button>
                  </HintWrap>
                  {jdLoading && jdProgress.total > 0 && (
                    <ProgressBar
                      current={jdProgress.current}
                      total={jdProgress.total}
                      label={jdProgress.status}
                    />
                  )}
                </div>
              )}

              <GenerationFailures
                results={jdResults}
                label={(r) => r.filename || `job_${r.jdIndex + 1}.txt`}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Upload TXT → separate Resume & Cover Letter DOCX */}
      <Card>
        <CardHeader
          icon={FileDown}
          title="Convert TXT to DOCX"
          description="Upload combined resume + cover letter .txt files. Each one is split into a formatted Resume.docx and Cover Letter.docx you can download separately."
        />
        <CardBody className="space-y-4">
          {driveStatus.loaded && driveBlocked && (
            <Alert tone="warning">{driveBlockedText}</Alert>
          )}

          <Dropzone
            files={txtFiles}
            onFilesChange={(files) => {
              setTxtFiles(files);
              setTxtResults([]);
            }}
            disabled={txtUploading}
            label="Combined .txt files"
          />

          <Button
            variant="primary"
            icon={Wand2}
            onClick={convertTxtToDocx}
            loading={txtUploading}
            disabled={txtUploading || !txtFiles.length || driveBlocked}
          >
            Convert{txtFiles.length ? ` ${txtFiles.length} ${plural(txtFiles.length, 'file')}` : ''}
          </Button>

          {txtResults.length > 0 && (
            <ul className="space-y-2">
              {txtResults.map((result, index) => (
                <li
                  key={result.upload_id || `row-${index}`}
                  className={cn(
                    'rounded-xl border p-3',
                    result.success ? 'border-border bg-surface' : 'border-danger/25 bg-danger-soft'
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                      {result.original_filename}
                    </span>
                    {result.success ? (
                      <DriveNote drive={result.drive} />
                    ) : (
                      <span className="text-xs text-danger-fg">{result.error}</span>
                    )}
                  </div>

                  {result.success && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={Download}
                        onClick={() =>
                          downloadUploadedDoc(
                            result.upload_id,
                            'resume',
                            result.original_filename?.replace(/\.txt$/i, '')
                          )
                        }
                      >
                        Resume.docx
                      </Button>
                      {result.has_pdf && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={Download}
                          onClick={() =>
                            downloadUploadedDoc(
                              result.upload_id,
                              'resume-pdf',
                              result.original_filename?.replace(/\.txt$/i, '')
                            )
                          }
                        >
                          Resume.pdf
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={Download}
                        onClick={() =>
                          downloadUploadedDoc(
                            result.upload_id,
                            'cover-letter',
                            result.original_filename?.replace(/\.txt$/i, '')
                          )
                        }
                      >
                        Cover Letter.docx
                      </Button>
                      <Button
                        variant="success"
                        size="sm"
                        icon={Package}
                        onClick={() =>
                          downloadBundle(
                            result.upload_id as string,
                            result.folder_name || result.original_filename?.replace(/\.txt$/i, '') || ''
                          )
                        }
                      >
                        Both as .zip
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
