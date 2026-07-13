import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import DriveCard from './DriveCard';
import { API_BASE_URL } from './auth';
import './App.css';

/** Trigger a browser download for a blob response. */
function saveBlob(data, filename) {
  const url = window.URL.createObjectURL(new Blob([data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * An error body from a blob-typed request arrives as a Blob, not JSON — read it
 * back so the user sees the real reason instead of a generic failure.
 */
async function blobErrorDetail(err, fallback) {
  const data = err.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (typeof parsed.detail === 'string') return parsed.detail;
    } catch {
      // Not JSON — fall through to the generic message.
    }
  }
  if (typeof data?.detail === 'string') return data.detail;
  return fallback;
}

/**
 * Google Drive outcome for a TXT conversion. Renders nothing when Drive isn't
 * connected — that's the normal state, not a problem.
 */
function DriveNote({ drive }) {
  if (!drive || !drive.connected) return null;
  if (drive.synced) {
    return (
      <a className="drive-note" href={drive.folder_link} target="_blank" rel="noopener noreferrer">
        Saved to Google Drive ↗
      </a>
    );
  }
  return <span className="drive-note drive-note-error">Not saved to Drive: {drive.error}</span>;
}

/**
 * The jobs that failed in the last run, and why.
 *
 * Successes deliberately aren't listed: they show up in the Generated resumes table,
 * which is the single place resumes are found and downloaded. A failure has no row
 * there, so it would otherwise vanish without explanation.
 */
function GenerationFailures({ results, label }) {
  const failed = results.filter((r) => !r.success);
  if (failed.length === 0) return null;
  return (
    <div className="generation-failures">
      <h3 className="subsection-title">Could not generate ({failed.length})</h3>
      <ul className="results-list">
        {failed.map((r, i) => (
          <li key={i} className="result-item result-error">
            <div className="result-main">
              <span className="result-link">{label(r)}</span>
              <div className="result-error-msg">{r.error}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function App() {
  const [jobLinksText, setJobLinksText] = useState('');
  // Profiles come from the server and are per-user: an admin decides which candidate
  // profiles this account may use. Until they load we assume none, so we never show a
  // profile the user isn't allowed to generate with.
  const [candidateName, setCandidateName] = useState('');
  const [profileOptions, setProfileOptions] = useState([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });
  // Only the failures of the last run are kept here. Successes don't need their own
  // list: they land in the history table below, which is the one place files live.
  const [results, setResults] = useState([]);
  const [scrapeResults, setScrapeResults] = useState([]);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Upload TXT -> DOCX (resume + cover letter separate downloads); supports multiple files
  const [txtFiles, setTxtFiles] = useState([]);
  const [txtUploading, setTxtUploading] = useState(false);
  const [txtResults, setTxtResults] = useState([]);
  const [txtMessage, setTxtMessage] = useState({ type: '', text: '' });

  // ResumeGPT + Job Description flow — upload JDs, generate resume + CL
  const [resumegptFile, setResumegptFile] = useState(null);
  const [jdFiles, setJdFiles] = useState([]);
  const [jdList, setJdList] = useState({ job_descriptions: [], count: 0, has_resumegpt: false });
  const [jdLoading, setJdLoading] = useState(false);
  const [jdProgress, setJdProgress] = useState({ current: 0, total: 0, status: '' });
  const [jdResults, setJdResults] = useState([]);
  const [jdMessage, setJdMessage] = useState({ type: '', text: '' });

  // Generated resumes — the single table of everything ever generated for this profile,
  // and the only place files are downloaded from. Rows carry Drive file ids, so this
  // works for resumes generated weeks ago, not just the ones from this session.
  const [history, setHistory] = useState({ file_path: '', history: [], count: 0 });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageInput, setHistoryPageInput] = useState('1');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [downloadingHistory, setDownloadingHistory] = useState(false);
  const HISTORY_PAGE_SIZE = 10;

  const loadCompanyRolesHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = candidateName && candidateName.trim() ? { candidate_name: candidateName.trim() } : {};
      const res = await axios.get(`${API_BASE_URL}/api/company-roles-history`, { params });
      setHistory({
        file_path: res.data.file_path || '',
        history: res.data.history || [],
        count: res.data.count || 0,
      });
    } catch (err) {
      setHistory({ file_path: '', history: [], count: 0 });
    } finally {
      setHistoryLoading(false);
    }
  }, [candidateName]);

  useEffect(() => {
    loadCompanyRolesHistory();
  }, [loadCompanyRolesHistory]);

  useEffect(() => {
    setHistoryPage(1);
    setHistoryPageInput('1');
  }, [history.history.length]);

  useEffect(() => { setHistoryPageInput(String(historyPage)); }, [historyPage]);

  // Newest first: the resume you just generated is the one you most likely want.
  // The sheet appends, so its natural order is oldest first.
  const historyRows = (history.history || []).slice().reverse();
  const historyFiltered = historyRows.filter((r) => {
    const day = (r.date || '').slice(0, 10);
    if (dateFrom && day < dateFrom) return false;
    if (dateTo && day > dateTo) return false;
    return true;
  });

  // Rows generated before file history existed, or while Drive was disconnected, have
  // no file ids — nothing to download, so they can't be selected either.
  const selectableIds = historyFiltered.filter((r) => r.downloadable).map((r) => r.id);
  const selectedCount = selectedIds.size;
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  // Selection means "selected among what you can currently see". Narrowing the date
  // range therefore drops rows that scrolled out of the filter, so the count on the
  // Download button always matches the rows on screen.
  useEffect(() => {
    setSelectedIds((prev) => {
      const allowed = new Set(selectableIds);
      const next = new Set([...prev].filter((id) => allowed.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, history.history]);

  const historyTotalPages = Math.max(1, Math.ceil(historyFiltered.length / HISTORY_PAGE_SIZE));
  const historyStart = (Math.min(historyPage, historyTotalPages) - 1) * HISTORY_PAGE_SIZE;
  const historyPageRows = historyFiltered.slice(historyStart, historyStart + HISTORY_PAGE_SIZE);

  const toggleRow = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Header checkbox: selects every downloadable row matching the filter, not just this page. */
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
  };

  const clearDateFilter = () => {
    setDateFrom('');
    setDateTo('');
  };

  useEffect(() => {
    setHistoryPage(1);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    axios
      .get(`${API_BASE_URL}/api/profiles`)
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

  // No profile assigned (or the admin revoked them all) — nothing here can be generated.
  const noProfileAssigned = profilesLoaded && profileOptions.length === 0;

  const parseLinks = (text) => {
    return text
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && (s.startsWith('http://') || s.startsWith('https://')));
  };

  const scrapeAll = async () => {
    const urls = parseLinks(jobLinksText);
    if (urls.length === 0) {
      setMessage({ type: 'error', text: 'Please paste at least one job link (one per line or comma-separated).' });
      return;
    }
    setMessage({ type: '', text: '' });
    setScrapeResults([]);
    setLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/api/upload-job-urls`, { urls });
      const res = await axios.post(`${API_BASE_URL}/api/scrape-job-urls`, {
        candidate_name: candidateName.trim() || 'Jaspreet Sethi',
      });
      setScrapeResults(res.data.results || []);
      const sc = res.data.success_count ?? 0;
      const tot = res.data.total ?? urls.length;
      setMessage({
        type: sc === tot ? 'success' : sc > 0 ? 'info' : 'error',
        text: res.data.message || `Scraped ${sc} of ${tot}. Job descriptions saved to job_descriptions/{profile}/{date}/`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Scrape failed.' });
    } finally {
      setLoading(false);
    }
  };

  const generateAll = async () => {
    const urls = parseLinks(jobLinksText);
    if (urls.length === 0) {
      setMessage({ type: 'error', text: 'Please paste at least one job link (one per line or comma-separated).' });
      return;
    }

    setMessage({ type: '', text: '' });
    setResults([]);
    setLoading(true);

    try {
      await axios.post(`${API_BASE_URL}/api/upload-job-urls`, { urls });
      const total = urls.length;
      const resultList = [];

      for (let jobIndex = 0; jobIndex < total; jobIndex++) {
        setProgress({ current: jobIndex + 1, total, status: `Generating resume & cover letter for job ${jobIndex + 1} of ${total}...` });

        try {
          const response = await axios.post(`${API_BASE_URL}/api/generate-resume/${jobIndex}`, {
            candidate_name: candidateName.trim() || 'Jaspreet Sethi',
          });
          resultList.push({
            jobIndex,
            url: urls[jobIndex],
            success: true,
            folderName: response.data.folder_name,
            hasPdf: !!response.data.has_pdf,
            resumePdfError: response.data.resume_pdf_error || null,
            drive: response.data.drive || null,
          });
        } catch (err) {
          const raw = err.response?.data?.detail ?? err.message ?? 'Failed to generate';
          const errorMsg = Array.isArray(raw) ? raw.map((x) => (x?.msg ?? x)).join(' ') : raw;
          resultList.push({
            jobIndex,
            url: urls[jobIndex],
            success: false,
            error: errorMsg,
          });
        }
      }

      setResults(resultList);
      setProgress({ current: total, total, status: '' });
      const successCount = resultList.filter((r) => r.success).length;
      if (successCount > 0) loadCompanyRolesHistory();
      setMessage({
        type: successCount === total ? 'success' : successCount > 0 ? 'info' : 'error',
        text: `Done. ${successCount} of ${total} resume(s) and cover letter(s) generated — find them in Generated resumes below.`,
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Error uploading job URLs or generating resumes.',
      });
    } finally {
      setLoading(false);
      setProgress({ current: 0, total: 0, status: '' });
    }
  };

  /** ZIP one TXT conversion's output. The TXT flow isn't part of resume history. */
  const downloadBundle = async (path, folderName, onError) => {
    try {
      const response = await axios.get(`${API_BASE_URL}${path}`, { responseType: 'blob' });
      saveBlob(response.data, `${(folderName || 'generated_files').replace(/[\\/:*?"<>|]/g, '_')}.zip`);
    } catch (err) {
      onError(await blobErrorDetail(err, 'Error downloading ZIP'));
    }
  };

  /**
   * ZIP any set of past generations, a folder per resume.
   *
   * The server reads these from Drive by file id, so this works for anything in the
   * history — not only what this session generated.
   */
  const downloadHistory = async (body, filename) => {
    setDownloadingHistory(true);
    setMessage({ type: '', text: '' });
    try {
      const payload = { ...body };
      if (candidateName && candidateName.trim()) payload.candidate_name = candidateName.trim();
      const response = await axios.post(`${API_BASE_URL}/api/download/history`, payload, {
        responseType: 'blob',
      });
      saveBlob(response.data, filename);

      const missing = parseInt(response.headers['x-missing-files'], 10);
      setMessage(
        missing > 0
          ? {
              type: 'info',
              text: `Downloaded, but ${missing} file(s) were missing from Google Drive — they may have been deleted or moved there.`,
            }
          : { type: 'success', text: 'Download ready.' }
      );
    } catch (err) {
      setMessage({ type: 'error', text: await blobErrorDetail(err, 'Error downloading files') });
    } finally {
      setDownloadingHistory(false);
    }
  };

  const downloadSelected = () =>
    downloadHistory({ ids: [...selectedIds] }, `resumes_${selectedIds.size}_selected.zip`);

  /** Everything the date filter currently shows — or the whole history when it's empty. */
  const downloadFiltered = () => {
    const body = {};
    if (dateFrom) body.date_from = dateFrom;
    if (dateTo) body.date_to = dateTo;
    const name =
      dateFrom && dateTo ? `resumes_${dateFrom}_to_${dateTo}.zip` : `resumes_${selectableIds.length}_selected.zip`;
    return downloadHistory(body, name);
  };

  const handleTxtFileChange = (e) => {
    const chosen = e.target.files;
    setTxtFiles(chosen ? Array.from(chosen) : []);
    setTxtResults([]);
    setTxtMessage({ type: '', text: '' });
  };

  const convertTxtToDocx = async () => {
    if (!txtFiles.length) {
      setTxtMessage({ type: 'error', text: 'Please select one or more .txt files first.' });
      return;
    }
    setTxtUploading(true);
    setTxtMessage({ type: '', text: '' });
    try {
      const formData = new FormData();
      txtFiles.forEach((file) => formData.append('files', file));
      if (candidateName && candidateName.trim()) {
        formData.append('candidate_name', candidateName.trim());
      }
      const response = await axios.post(`${API_BASE_URL}/api/upload-resume-txt`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setTxtResults(response.data.results || []);
      const successCount = (response.data.results || []).filter((r) => r.success).length;
      const total = (response.data.results || []).length;
      setTxtMessage({
        type: successCount === total ? 'success' : successCount > 0 ? 'info' : 'error',
        text: successCount === total
          ? `All ${total} file(s) converted. Download Resume.docx and Cover Letter.docx for each below.`
          : `${successCount} of ${total} file(s) converted.${successCount < total ? ' Some files had errors.' : ''}`,
      });
    } catch (err) {
      setTxtMessage({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to convert files.',
      });
    } finally {
      setTxtUploading(false);
    }
  };

  const loadJdList = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/job-descriptions`);
      setJdList({
        job_descriptions: res.data.job_descriptions || [],
        count: res.data.count || 0,
        has_resumegpt: res.data.has_resumegpt || false,
      });
    } catch {
      setJdList({ job_descriptions: [], count: 0, has_resumegpt: false });
    }
  };

  const handleResumegptChange = (e) => {
    setResumegptFile(e.target.files?.[0] || null);
    setJdMessage({ type: '', text: '' });
  };

  const handleJdFilesChange = (e) => {
    setJdFiles(e.target.files ? Array.from(e.target.files) : []);
    setJdMessage({ type: '', text: '' });
  };

  const uploadResumegptAndJds = async () => {
    if (!jdFiles.length) {
      setJdMessage({ type: 'error', text: 'Please select at least one job description .txt file.' });
      return;
    }
    setJdLoading(true);
    setJdMessage({ type: '', text: '' });
    setJdResults([]);
    try {
      if (resumegptFile) {
        const fd = new FormData();
        fd.append('file', resumegptFile);
        await axios.post(`${API_BASE_URL}/api/upload-resumegpt`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      const fd = new FormData();
      jdFiles.forEach((f) => fd.append('files', f));
      await axios.post(`${API_BASE_URL}/api/upload-job-descriptions`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await loadJdList();
      setJdMessage({ type: 'success', text: `Uploaded ResumeGPT${resumegptFile ? ' and ' : ' '}${jdFiles.length} job description file(s). Click Generate below.` });
      setResumegptFile(null);
      setJdFiles([]);
    } catch (err) {
      setJdMessage({ type: 'error', text: err.response?.data?.detail || 'Upload failed.' });
    } finally {
      setJdLoading(false);
    }
  };

  const generateFromJdAll = async () => {
    if (!jdList.count) {
      setJdMessage({ type: 'error', text: 'Upload job descriptions first.' });
      return;
    }
    setJdLoading(true);
    setJdMessage({ type: '', text: '' });
    setJdResults([]);
    const total = jdList.count;
    const resultList = [];
    for (let i = 0; i < total; i++) {
      setJdProgress({ current: i + 1, total, status: `Generating for job ${i + 1} of ${total}...` });
      try {
        const res = await axios.post(`${API_BASE_URL}/api/generate-from-job-description/${i}`, { candidate_name: candidateName.trim() || 'Jaspreet Sethi' });
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
        const detail = err.response?.data?.detail ?? err.message ?? 'Failed';
        resultList.push({ jdIndex: i, filename: jdList.job_descriptions[i]?.filename, success: false, error: detail });
      }
    }
    setJdProgress({ current: total, total, status: '' });
    setJdResults(resultList);
    const successCount = resultList.filter((r) => r.success).length;
    if (successCount > 0) loadCompanyRolesHistory();
    setJdMessage({
      type: successCount === total ? 'success' : successCount > 0 ? 'info' : 'error',
      text: `Done. ${successCount} of ${total} generated — find them in Generated resumes above.`,
    });
    setJdLoading(false);
  };

  const downloadUploadedDoc = async (uploadId, type, baseName) => {
    if (!uploadId) return;
    try {
      const path =
        type === 'resume'
          ? `/api/download/uploaded/resume/${uploadId}`
          : type === 'resume-pdf'
            ? `/api/download/uploaded/resume-pdf/${uploadId}`
            : `/api/download/uploaded/cover-letter/${uploadId}`;
      const response = await axios.get(`${API_BASE_URL}${path}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const ext =
        type === 'resume' ? 'Resume.docx' : type === 'resume-pdf' ? 'Resume.pdf' : 'Cover Letter.docx';
      link.setAttribute('download', baseName ? `${baseName}_${ext}` : ext);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setTxtMessage({ type: 'error', text: 'Error downloading file' });
    }
  };

  return (
    <div className="container">
      <h1 className="app-title">Resume & Cover Letter Generator</h1>
      <p className="app-subtitle">
        Paste job links below. We’ll generate a tailored resume and cover letter for each job and save them in folders named by company and role.
      </p>

      {/* Connect Google Drive so generated files are mirrored there automatically */}
      <DriveCard />

      {/* Generated resumes — the one table; also the only place downloads happen. */}
      <div className="card">
        <h2 className="section-title">Generated resumes</h2>
        <p className="section-desc">
          Every resume generated for the selected candidate profile. Tick the ones you want and
          download them as a ZIP — including resumes from earlier sessions, not just this one.
        </p>
        {historyLoading ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <div className="history-toolbar">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={loadCompanyRolesHistory}
                disabled={historyLoading}
              >
                Refresh
              </button>

              <label className="history-date-label">
                From
                <input
                  type="date"
                  className="history-date-input"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </label>
              <label className="history-date-label">
                To
                <input
                  type="date"
                  className="history-date-input"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </label>
              {(dateFrom || dateTo) && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearDateFilter}>
                  Clear dates
                </button>
              )}

              <span className="history-toolbar-spacer" />

              <button
                type="button"
                className="btn btn-success btn-sm"
                onClick={downloadSelected}
                disabled={downloadingHistory || selectedCount === 0}
                title="ZIP the ticked resumes, one folder each"
              >
                {downloadingHistory ? 'Preparing ZIP…' : `Download selected (${selectedCount})`}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={downloadFiltered}
                disabled={downloadingHistory || selectableIds.length === 0}
                title={
                  dateFrom || dateTo
                    ? 'ZIP every downloadable resume in the chosen date range'
                    : 'ZIP every downloadable resume in the history'
                }
              >
                {dateFrom || dateTo
                  ? `Download date range (${selectableIds.length})`
                  : `Download all (${selectableIds.length})`}
              </button>
            </div>

            {historyFiltered.length === 0 ? (
              <p className="muted">
                {history.history.length === 0
                  ? 'Nothing generated yet. Generate a resume from a job link to add one.'
                  : 'No resumes in that date range.'}
              </p>
            ) : (
              <>
                <div className="history-table-wrapper">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th className="history-check-col">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleSelectAll}
                            disabled={selectableIds.length === 0}
                            title="Select every downloadable resume matching the current filter"
                          />
                        </th>
                        <th>Date</th>
                        <th>Company</th>
                        <th>Role</th>
                        <th>Job URL</th>
                        <th>Files</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyPageRows.map((row) => (
                        <tr
                          key={row.id}
                          className={selectedIds.has(row.id) ? 'history-row-selected' : undefined}
                        >
                          <td className="history-check-col">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(row.id)}
                              disabled={!row.downloadable}
                              onChange={() => toggleRow(row.id)}
                              title={
                                row.downloadable
                                  ? 'Include in download'
                                  : 'No files stored for this one — it can only be regenerated'
                              }
                            />
                          </td>
                          <td>{(row.date || '').slice(0, 10)}</td>
                          <td>{row.company}</td>
                          <td>{row.role}</td>
                          <td>
                            {row.url ? (
                              <a href={row.url} target="_blank" rel="noopener noreferrer">
                                {row.url.length > 50 ? `${row.url.slice(0, 50)}…` : row.url}
                              </a>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>
                            {row.downloadable ? (
                              row.drive_folder_id ? (
                                <a
                                  href={`https://drive.google.com/drive/folders/${row.drive_folder_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={row.files.map((f) => f.name).join(', ')}
                                >
                                  {row.files.length} file{row.files.length === 1 ? '' : 's'} ↗
                                </a>
                              ) : (
                                <span>{row.files.length}</span>
                              )
                            ) : (
                              <span className="muted" title="Generated before files were kept, or while Drive was disconnected">
                                Not stored
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {historyTotalPages > 1 && (
                  <div className="history-pagination">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                      disabled={historyPage <= 1}
                    >
                      Previous
                    </button>
                    <span className="history-pagination-info">
                      Page
                      <input
                        type="number"
                        className="pagination-page-input"
                        min={1}
                        max={historyTotalPages}
                        value={historyPageInput}
                        onChange={(e) => setHistoryPageInput(e.target.value)}
                        onBlur={() => {
                          const val = parseInt(historyPageInput, 10);
                          if (!isNaN(val) && val >= 1 && val <= historyTotalPages) setHistoryPage(val);
                          else setHistoryPageInput(String(historyPage));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseInt(historyPageInput, 10);
                            if (!isNaN(val) && val >= 1 && val <= historyTotalPages) setHistoryPage(val);
                            else setHistoryPageInput(String(historyPage));
                            e.target.blur();
                          }
                        }}
                      />
                      of {historyTotalPages} ({historyFiltered.length} shown)
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                      disabled={historyPage >= historyTotalPages}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Integrated: Upload ResumeGPT & Job Descriptions + Job links + Generate */}
      <div className="card">
        <h2 className="section-title">ResumeGPT & Job Descriptions</h2>
        <p className="section-desc">
          Upload your ResumeGPT prompt (optional) and job description .txt files, or paste job URLs to scrape. We'll generate resume and cover letter for each job and save to generated_files/.
        </p>
        {jdMessage.text && (
          <div className={`alert alert-${jdMessage.type}`}>{jdMessage.text}</div>
        )}

        <div className="form-row-group">
          <div className="form-subsection">
            <h3 className="subsection-title">Upload files</h3>
            <div className="form-group">
              <label>ResumeGPT.txt (optional — uses default if not uploaded)</label>
              <input type="file" accept=".txt" onChange={handleResumegptChange} disabled={jdLoading} />
              {resumegptFile && <span className="file-name">{resumegptFile.name}</span>}
            </div>
            <div className="form-group">
              <label>Job description .txt files</label>
              <input type="file" accept=".txt" multiple onChange={handleJdFilesChange} disabled={jdLoading} />
              {jdFiles.length > 0 && <span className="file-name">{jdFiles.length} file(s): {jdFiles.map((f) => f.name).join(', ')}</span>}
            </div>
            <button className="btn btn-secondary" onClick={uploadResumegptAndJds} disabled={jdLoading || !jdFiles.length}>
              {jdLoading ? 'Uploading…' : 'Upload'}
            </button>
          </div>

          <div className="form-subsection">
            <h3 className="subsection-title">Job links</h3>
            <div className="form-group">
              <label>Paste job URLs (one per line or comma-separated)</label>
              <textarea
                className="job-links-textarea"
                placeholder="Paste job URLs here, one per line..."
                value={jobLinksText}
                onChange={(e) => setJobLinksText(e.target.value)}
                rows={6}
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>Candidate profile (used for resume content and file name)</label>
              {noProfileAssigned ? (
                <div className="alert alert-error">
                  No profile assigned. Please ask your administrator to assign a candidate profile to your account.
                </div>
              ) : (
                <>
                  <select
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    disabled={loading || jdLoading || !profilesLoaded}
                    className="profile-select"
                  >
                    {!profilesLoaded && <option value="">Loading profiles…</option>}
                    {profileOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <span className="muted small">Resume will be saved as e.g. {candidateName || 'Candidate'}.docx</span>
                </>
              )}
            </div>
            <div className="form-group" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={scrapeAll} disabled={loading || !candidateName}>
                {loading ? 'Scraping…' : 'Scrape job links (save .txt files)'}
              </button>
              <button
                className="btn btn-primary btn-generate"
                onClick={generateAll}
                disabled={loading || !candidateName}
              >
                {loading ? 'Generating…' : 'Generate from job links'}
              </button>
            </div>
            {jdList.count > 0 && (
              <>
                <p className="muted" style={{ marginTop: '1rem' }}>
                  {jdList.count} job description(s) ready. {jdList.has_resumegpt ? 'Custom ResumeGPT loaded.' : 'Using default ResumeGPT.'}
                </p>
                <button className="btn btn-primary" onClick={generateFromJdAll} disabled={jdLoading || !candidateName}>
                  {jdLoading ? 'Generating…' : `Generate resume & cover letter for all ${jdList.count} job(s)`}
                </button>
                {jdLoading && jdProgress.total > 0 && (
                  <div className="progress-info"><span>{jdProgress.status}</span> <span>{jdProgress.current}/{jdProgress.total}</span></div>
                )}
              </>
            )}
          </div>
        </div>

        {scrapeResults.length > 0 && (
          <p className="muted small" style={{ marginTop: '0.5rem' }}>
            Scrape complete: {scrapeResults.filter((r) => r.success).length}/{scrapeResults.length} job description(s) saved.
          </p>
        )}

        {loading && progress.total > 0 && (
          <div className="progress-info">
            <span>{progress.status}</span>
            <span className="progress-count">{progress.current} / {progress.total}</span>
          </div>
        )}

        {/* Only the ones that failed. Everything that worked is in Generated resumes above. */}
        <GenerationFailures
          results={results}
          label={(r) => `Job ${r.jobIndex + 1}: ${r.url}`}
        />
        <GenerationFailures
          results={jdResults}
          label={(r) => r.filename || `job_${r.jdIndex + 1}.txt`}
        />
      </div>

      {/* Upload TXT → separate Resume & Cover Letter DOCX */}
      <div className="card">
        <h2 className="section-title">Convert TXT to DOCX</h2>
        <p className="section-desc">
          Upload one or more combined resume + cover letter .txt files (different names allowed). We'll split each and give you two DOCX files per file to download.
        </p>
        {txtMessage.text && (
          <div className={`alert alert-${txtMessage.type}`}>
            {txtMessage.text}
          </div>
        )}
        <div className="form-group">
          <label>Choose .txt file(s)</label>
          <input
            type="file"
            accept=".txt"
            multiple
            onChange={handleTxtFileChange}
            disabled={txtUploading}
          />
          {txtFiles.length > 0 && (
            <span className="file-name">{txtFiles.length} file(s) selected: {txtFiles.map((f) => f.name).join(', ')}</span>
          )}
        </div>
        <button
          className="btn btn-primary"
          onClick={convertTxtToDocx}
          disabled={txtUploading || !txtFiles.length}
        >
          {txtUploading ? 'Converting…' : `Convert & prepare downloads${txtFiles.length ? ` (${txtFiles.length} file(s))` : ''}`}
        </button>
        {txtResults.length > 0 && (
          <ul className="txt-results-list">
            {txtResults.map((r, idx) => (
              <li key={r.upload_id || `row-${idx}`} className={`txt-result-item ${r.success ? 'result-success' : 'result-error'}`}>
                <span className="txt-result-filename">{r.original_filename}</span>
                {r.success ? (
                  <div className="result-actions">
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => downloadUploadedDoc(r.upload_id, 'resume', r.original_filename?.replace(/\.txt$/i, ''))}
                    >
                      Download Resume.docx
                    </button>
                    {r.has_pdf ? (
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => downloadUploadedDoc(r.upload_id, 'resume-pdf', r.original_filename?.replace(/\.txt$/i, ''))}
                      >
                        Download Resume.pdf
                      </button>
                    ) : null}
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => downloadUploadedDoc(r.upload_id, 'cover-letter', r.original_filename?.replace(/\.txt$/i, ''))}
                    >
                      Download Cover Letter.docx
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() =>
                        downloadBundle(
                          `/api/download/uploaded/bundle/${r.upload_id}`,
                          r.folder_name || r.original_filename?.replace(/\.txt$/i, ''),
                          (text) => setTxtMessage({ type: 'error', text })
                        )
                      }
                      title="Resume and cover letter for this file"
                    >
                      Download all (.zip)
                    </button>
                    <DriveNote drive={r.drive} />
                  </div>
                ) : (
                  <span className="result-error-msg">{r.error}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {message.text && (
        <div className={`alert alert-${message.type}`}>
          {message.text}
        </div>
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="loading">Processing… Please wait.</div>
        </div>
      )}
    </div>
  );
}

export default App;
