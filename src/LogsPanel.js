import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { API_BASE_URL } from './auth';

// The server holds the whole log; this only ever asks for a page of it. 100 rows is
// about a screenful of scrolling and keeps the response small enough to poll.
const PAGE_SIZE = 100;

const LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR'];

// Filters worth one click, because they are the questions actually asked of this log.
// "Missing files" is the reason the panel exists: it collects every line that reports a
// document which was generated but did not end up where it belongs.
const PRESETS = [
  { key: 'problems', label: 'Problems only', hint: 'Warnings and errors', filters: { level: 'WARNING', event: '', search: '' } },
  {
    key: 'missing',
    label: 'Missing files',
    hint: 'Generations that produced fewer documents than they should have',
    filters: { level: 'WARNING', event: '', search: 'missing' },
  },
  { key: 'drive', label: 'Drive uploads', hint: 'Every upload, retry and conversion', filters: { level: 'DEBUG', event: 'drive.', search: '' } },
  { key: 'generation', label: 'Generations', hint: 'Start and outcome of each generation', filters: { level: 'DEBUG', event: 'generation.', search: '' } },
  { key: 'slow', label: 'Retries', hint: 'Uploads that had to be retried', filters: { level: 'DEBUG', event: 'drive.attempt', search: '' } },
];

const EMPTY = { level: 'INFO', event: '', request_id: '', user_query: '', endpoint: '', search: '' };

// Fields rendered as their own chip next to the message. Everything else stays in the
// expanded JSON — a log line can carry a dozen fields and only a few earn screen space.
const CHIP_FIELDS = ['status', 'duration_ms', 'file', 'folder', 'profile', 'company', 'attempt'];

/** Just the level modifier, so it can colour a badge or a timeline rule. */
function levelModifier(level) {
  const l = (level || '').toUpperCase();
  if (l === 'ERROR' || l === 'CRITICAL') return 'log-level-error';
  if (l === 'WARNING') return 'log-level-warn';
  if (l === 'DEBUG') return 'log-level-debug';
  return 'log-level-info';
}

function levelClass(level) {
  return `log-level ${levelModifier(level)}`;
}

function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatBytes(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** The handful of context fields worth showing inline, as small chips. */
function chipsFor(entry) {
  return CHIP_FIELDS
    .filter((f) => entry[f] !== undefined && entry[f] !== null && entry[f] !== '')
    .map((f) => [f, f === 'duration_ms' ? `${entry[f]} ms` : String(entry[f])]);
}

function LogRow({ entry, expanded, onToggle, onTrace }) {
  const chips = chipsFor(entry);
  return (
    <>
      <tr className={`log-row${expanded ? ' log-row-open' : ''}`} onClick={onToggle}>
        <td className="log-time">{formatTime(entry.ts)}</td>
        <td><span className={levelClass(entry.level)}>{entry.level}</span></td>
        <td className="log-event"><code>{entry.event}</code></td>
        <td className="log-msg">
          <span>{entry.msg}</span>
          {chips.length > 0 && (
            <span className="log-chips">
              {chips.map(([k, v]) => (
                <span className="log-chip" key={k}>{k}: {v}</span>
              ))}
            </span>
          )}
        </td>
        <td className="log-rid">
          {entry.request_id ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              title="Show every line this request produced, in order"
              onClick={(e) => { e.stopPropagation(); onTrace(entry.request_id); }}
            >
              Trace
            </button>
          ) : (
            <span className="muted small">—</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="log-detail-row">
          <td colSpan={5}>
            <pre className="log-detail">{JSON.stringify(entry, null, 2)}</pre>
          </td>
        </tr>
      )}
    </>
  );
}

/** The ordered timeline of one request — the view that explains a half-finished job. */
function TraceView({ requestId, onClose }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setEntries(null);
    setError('');
    axios
      .get(`${API_BASE_URL}/api/admin/logs/request/${encodeURIComponent(requestId)}`)
      .then((res) => { if (alive) setEntries(res.data.entries || []); })
      .catch((err) => { if (alive) setError(err.response?.data?.detail || 'Could not load the trace.'); });
    return () => { alive = false; };
  }, [requestId]);

  const first = entries && entries[0];
  return (
    <div className="log-trace">
      <div className="log-trace-head">
        <div>
          <strong>Request {requestId}</strong>
          {first && (
            <span className="muted small">
              {' '}— {first.endpoint || 'unknown endpoint'}
              {first.user_email ? ` · ${first.user_email}` : ''}
            </span>
          )}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {!entries && !error && <p className="muted">Loading trace…</p>}
      {entries && entries.length === 0 && (
        <p className="muted">
          Nothing left for this request — its lines have already rotated out of the log.
        </p>
      )}

      {entries && entries.length > 0 && (
        <ol className="log-timeline">
          {entries.map((e, i) => (
            <li key={i} className={`log-timeline-item ${levelModifier(e.level)}`}>
              <div className="log-timeline-head">
                <code>{e.event}</code>
                <span className="muted small">{formatTime(e.ts)}</span>
                {e.duration_ms !== undefined && <span className="log-chip">{e.duration_ms} ms</span>}
              </div>
              <div className="log-timeline-msg">{e.msg}</div>
              {e.error && <div className="log-timeline-error">{e.error}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function LogsPanel() {
  const [filters, setFilters] = useState(EMPTY);
  const [draftSearch, setDraftSearch] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [traceId, setTraceId] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [open, setOpen] = useState(false);

  // The search box is debounced into `filters` so typing doesn't fire a request per
  // keystroke against a log file that may be tens of megabytes.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.search === draftSearch ? f : { ...f, search: draftSearch })), 400);
    return () => clearTimeout(t);
  }, [draftSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_BASE_URL}/api/admin/logs`, {
        params: { ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load the logs.');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { if (open) load(); }, [open, load]);

  // Polling is opt-in and stops when the panel is closed, so an idle admin tab does
  // not sit there querying the log file every few seconds forever.
  const savedLoad = useRef(load);
  useEffect(() => { savedLoad.current = load; }, [load]);
  useEffect(() => {
    if (!open || !autoRefresh) return undefined;
    const id = setInterval(() => savedLoad.current(), 5000);
    return () => clearInterval(id);
  }, [open, autoRefresh]);

  const setFilter = (key, value) => {
    setPage(0);
    setExpanded(null);
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const applyPreset = (preset) => {
    setPage(0);
    setExpanded(null);
    setTraceId(null);
    setDraftSearch(preset.filters.search || '');
    setFilters({ ...EMPTY, ...preset.filters });
  };

  const clearFilters = () => {
    setPage(0);
    setDraftSearch('');
    setFilters(EMPTY);
  };

  // Fetched through axios rather than opened in a tab: the endpoint is admin-only and
  // the bearer token lives on the axios instance, not on the browser's navigation.
  const download = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/admin/logs/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/x-ndjson' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'app.jsonl');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Could not download the log file.');
    }
  };

  const entries = data?.entries || [];
  const total = data?.total_matched || 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const dirty = useMemo(
    () => JSON.stringify(filters) !== JSON.stringify(EMPTY) || !!draftSearch,
    [filters, draftSearch],
  );

  return (
    <div className="card">
      <div className="log-head">
        <div>
          <h2 className="section-title">Logs</h2>
          <p className="section-desc">
            Every request the backend handles writes a structured trace here: the scrape, the model call, the
            documents it built, and each individual Drive upload with its retries. When a job comes back with a
            resume but no job description or PDF, <strong>Trace</strong> on any of its lines shows the step that
            failed and the reason Google gave for it.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide logs' : 'Show logs'}
        </button>
      </div>

      {open && (
        <>
          {error && <div className="alert alert-error">{error}</div>}

          <div className="log-presets">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className="usage-view"
                title={p.hint}
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="usage-filters">
            <div className="usage-filter">
              <span className="usage-filter-label">Level</span>
              <select className="form-input" value={filters.level} onChange={(e) => setFilter('level', e.target.value)}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>{l} and above</option>
                ))}
              </select>
            </div>

            <div className="usage-filter">
              <span className="usage-filter-label">Event</span>
              <input
                type="search"
                className="form-input"
                placeholder="drive.upload, generation…"
                value={filters.event}
                onChange={(e) => setFilter('event', e.target.value)}
              />
            </div>

            <div className="usage-filter">
              <span className="usage-filter-label">Request id</span>
              <input
                type="search"
                className="form-input"
                placeholder="exact id"
                value={filters.request_id}
                onChange={(e) => setFilter('request_id', e.target.value)}
              />
            </div>

            <div className="usage-filter">
              <span className="usage-filter-label">User</span>
              <input
                type="search"
                className="form-input"
                placeholder="email or sub"
                value={filters.user_query}
                onChange={(e) => setFilter('user_query', e.target.value)}
              />
            </div>

            <div className="usage-filter usage-filter-grow">
              <span className="usage-filter-label">Search</span>
              <input
                type="search"
                className="form-input"
                placeholder="Any text in the line — a company, a filename, a Google error"
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
              />
            </div>

            {dirty && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>

          <div className="log-toolbar">
            <span className="muted small">
              {loading ? 'Loading…' : `${total}${data?.truncated ? '+' : ''} matching line${total === 1 ? '' : 's'}`}
              {data?.stats && ` · ${data.stats.files} file(s), ${formatBytes(data.stats.bytes)} on disk · level ${data.stats.level}`}
            </span>
            <div className="log-toolbar-actions">
              <label className="log-auto">
                <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
                {' '}Auto-refresh
              </label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
                Refresh
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={download}>
                Download raw
              </button>
            </div>
          </div>

          {traceId && <TraceView requestId={traceId} onClose={() => setTraceId(null)} />}

          <div className="history-table-wrapper">
            <table className="history-table log-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Level</th>
                  <th>Event</th>
                  <th>Message</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="muted">
                      Nothing matches these filters yet.
                    </td>
                  </tr>
                )}
                {entries.map((entry, i) => {
                  const id = `${entry.ts}-${i}`;
                  return (
                    <LogRow
                      key={id}
                      entry={entry}
                      expanded={expanded === id}
                      onToggle={() => setExpanded(expanded === id ? null : id)}
                      onTrace={setTraceId}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <div className="log-pager">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Newer
              </button>
              <span className="muted small">Page {page + 1} of {lastPage + 1}</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page >= lastPage || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Older
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
