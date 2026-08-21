import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth, API_BASE_URL } from './auth';
import LogsPanel from './LogsPanel';

// Rows shown per page in the raw usage log. The aggregates above it always cover the
// whole filtered set — only this table is paged.
const LOG_PAGE_SIZE = 25;
const USER_PAGE_SIZE = 20;

const EMPTY_FILTERS = {
  group_by: 'day',
  date_from: '',
  date_to: '',
  user_sub: '',
  profile: '',
  action: '',
  search: '',
};

/** Trigger a browser download for a blob response. */
function saveBlob(data, filename, type) {
  const url = window.URL.createObjectURL(new Blob([data], type ? { type } : undefined));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// An error body from a blob-typed request arrives as a Blob, not JSON.
async function blobErrorDetail(err, fallback) {
  const body = err.response?.data;
  if (body instanceof Blob) {
    try {
      return JSON.parse(await body.text()).detail || fallback;
    } catch {
      return fallback;
    }
  }
  return body?.detail || fallback;
}

// --- UTC day helpers -------------------------------------------------------
// Usage rows are stamped in UTC, so the quick ranges must be UTC too: at 01:00 in
// Asia/Kolkata a local "today" would ask for a day the sheet has not reached yet.
function utcDay(date) {
  return date.toISOString().slice(0, 10);
}

function utcToday() {
  return utcDay(new Date());
}

function utcDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return utcDay(d);
}

function utcWeekStart() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // back to Monday
  return utcDay(d);
}

function utcMonthStart() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function formatMoney(value, currency) {
  if (value === null || value === undefined) return '—';
  const code = (currency || 'usd').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(value);
  } catch {
    return `${value} ${code}`;
  }
}

function formatDate(seconds) {
  if (!seconds) return '—';
  try {
    return new Date(seconds * 1000).toLocaleString();
  } catch {
    return '—';
  }
}

// Usage timestamps are ISO-8601 strings, not the epoch seconds the auth records use.
function formatTimestamp(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '—';
  }
}

function formatNumber(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat().format(value);
}

function formatCompact(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** One headline figure: how many generations, and what they cost. */
function UsageTile({ label, tally, hint, emphasis }) {
  const t = tally || { generations: 0, cost_usd: 0, total_tokens: 0, users: 0 };
  return (
    <div className={`admin-spend-tile${emphasis ? ' admin-spend-tile-accent' : ''}`}>
      <span className="admin-spend-label">{label}</span>
      <span className="admin-spend-value">{formatNumber(t.generations)}</span>
      <span className="muted small">
        {formatMoney(t.cost_usd, 'usd')} · {formatCompact(t.total_tokens)} tokens
        {t.users !== undefined ? ` · ${formatNumber(t.users)} user(s)` : ''}
      </span>
      {hint && <span className="muted small">{hint}</span>}
    </div>
  );
}

/** Per-user totals across the fixed windows, plus the active date range. */
function UsageUserTable({ users, rangeActive, activeSub, onFocusUser }) {
  if (!users?.length) return <p className="muted">No generations match these filters.</p>;
  return (
    <div className="history-table-wrapper">
      <table className="history-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Email</th>
            <th>Today</th>
            <th>This week</th>
            <th>This month</th>
            <th>Last 30d</th>
            {rangeActive && <th>In range</th>}
            <th>All time</th>
            <th>Tokens</th>
            <th>Est. cost</th>
            <th>Last generated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.sub} className={activeSub === u.sub ? 'history-row-selected' : undefined}>
              <td>
                {u.name || '—'}
                {u.profiles?.length > 0 && (
                  <div className="muted small">{u.profiles.join(', ')}</div>
                )}
              </td>
              <td>{u.email || '—'}</td>
              <td>{formatNumber(u.today.generations)}</td>
              <td>{formatNumber(u.week.generations)}</td>
              <td>{formatNumber(u.month.generations)}</td>
              <td>{formatNumber(u.last_30.generations)}</td>
              {rangeActive && <td>{formatNumber(u.range.generations)}</td>}
              <td>{formatNumber(u.total.generations)}</td>
              <td>{formatCompact(u.total.total_tokens)}</td>
              <td>{formatMoney(u.total.cost_usd, 'usd')}</td>
              <td>{formatTimestamp(u.last_used_at)}</td>
              <td>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onFocusUser(activeSub === u.sub ? '' : u.sub)}
                >
                  {activeSub === u.sub ? 'Clear' : 'Drill in'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Totals per calendar period, newest first. */
function UsagePeriodTable({ series, groupBy }) {
  if (!series?.length) return <p className="muted">Nothing generated in this range.</p>;
  const heading = groupBy === 'month' ? 'Month' : groupBy === 'week' ? 'Week' : 'Day';
  return (
    <div className="history-table-wrapper">
      <table className="history-table">
        <thead>
          <tr>
            <th>{heading}</th>
            <th>Generations</th>
            <th>Users</th>
            <th>Tokens</th>
            <th>Est. cost</th>
          </tr>
        </thead>
        <tbody>
          {[...series].reverse().map((s) => (
            <tr key={s.period}>
              <td>
                {s.label}
                <div className="muted small">{s.period}</div>
              </td>
              <td>{formatNumber(s.generations)}</td>
              <td>{formatNumber(s.users)}</td>
              <td>{formatCompact(s.total_tokens)}</td>
              <td>{formatMoney(s.cost_usd, 'usd')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Who generated how many, per period — the grid the daily/weekly question really asks. */
function UsageMatrix({ matrix, groupBy }) {
  const periods = [...(matrix?.periods || [])].reverse();
  if (!periods.length || !matrix?.rows?.length) {
    return <p className="muted">Nothing generated in this range.</p>;
  }
  const columnTotal = (period) =>
    matrix.rows.reduce((sum, row) => sum + (row.cells[period]?.generations || 0), 0);
  return (
    <>
      {matrix.truncated && (
        <p className="muted small">
          Showing the most recent {periods.length} of {matrix.total_periods} {groupBy}s — narrow the
          date range to see earlier ones.
        </p>
      )}
      <div className="history-table-wrapper">
        <table className="history-table usage-matrix">
          <thead>
            <tr>
              <th className="usage-matrix-user">User</th>
              {periods.map((p) => (
                <th key={p.period} title={p.label}>
                  {groupBy === 'day' ? p.period.slice(5) : p.period}
                </th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.sub}>
                <td className="usage-matrix-user">
                  {row.name || row.email || row.sub}
                  <div className="muted small">{row.email}</div>
                </td>
                {periods.map((p) => {
                  const cell = row.cells[p.period];
                  return (
                    <td key={p.period} className={cell ? 'usage-cell-hit' : 'usage-cell-empty'}>
                      {cell ? (
                        <span title={`${formatMoney(cell.cost_usd, 'usd')} · ${formatNumber(cell.total_tokens)} tokens`}>
                          {formatNumber(cell.generations)}
                        </span>
                      ) : (
                        '·'
                      )}
                    </td>
                  );
                })}
                <td><strong>{formatNumber(row.total.generations)}</strong></td>
              </tr>
            ))}
            <tr>
              <td className="usage-matrix-user"><strong>All users</strong></td>
              {periods.map((p) => (
                <td key={p.period}><strong>{formatNumber(columnTotal(p.period))}</strong></td>
              ))}
              <td>
                <strong>
                  {formatNumber(matrix.rows.reduce((sum, r) => sum + r.total.generations, 0))}
                </strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

/** A simple "group by one column" table: profile, action or model. */
function UsageBreakdown({ title, field, rows, onSelect }) {
  return (
    <div className="usage-breakdown">
      <h4 className="usage-breakdown-title">{title}</h4>
      {rows?.length ? (
        <div className="history-table-wrapper">
          <table className="history-table">
            <thead>
              <tr>
                <th>{title}</th>
                <th>Generations</th>
                <th>Users</th>
                <th>Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[field]}>
                  <td>
                    {onSelect && r[field] !== '—' ? (
                      <button type="button" className="link-button" onClick={() => onSelect(r[field])}>
                        {r[field]}
                      </button>
                    ) : (
                      r[field]
                    )}
                  </td>
                  <td>{formatNumber(r.generations)}</td>
                  <td>{formatNumber(r.users)}</td>
                  <td>{formatMoney(r.cost_usd, 'usd')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Nothing in this range.</p>
      )}
    </div>
  );
}

/** The raw log: one row per generation, exactly as recorded. */
function UsageLog({ rows, page, onPage }) {
  const items = rows?.items || [];
  const total = rows?.total || 0;
  const first = total === 0 ? 0 : (rows.offset || 0) + 1;
  const last = (rows.offset || 0) + items.length;
  return (
    <>
      {items.length === 0 ? (
        <p className="muted">No generations match these filters.</p>
      ) : (
        <div className="history-table-wrapper">
          <table className="history-table">
            <thead>
              <tr>
                <th>When (UTC)</th>
                <th>User</th>
                <th>Profile</th>
                <th>Source</th>
                <th>Company</th>
                <th>Role</th>
                <th>Model</th>
                <th>Tokens</th>
                <th>Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => (
                <tr key={`${r.timestamp_utc}-${r.sub}-${i}`}>
                  <td>{formatTimestamp(r.timestamp_utc)}</td>
                  <td>
                    {r.name || '—'}
                    <div className="muted small">{r.email}</div>
                  </td>
                  <td>{r.profile || '—'}</td>
                  <td>{r.action === 'job_url' ? 'Job link' : r.action === 'job_description' ? 'JD file' : r.action || '—'}</td>
                  <td>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer">{r.company || '—'}</a>
                    ) : (
                      r.company || '—'
                    )}
                  </td>
                  <td>{r.role || '—'}</td>
                  <td>{r.model || '—'}</td>
                  <td>{formatNumber(r.total_tokens)}</td>
                  <td>{formatMoney(r.cost_usd, 'usd')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="history-pagination">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onPage(page - 1)}
          disabled={page === 0}
        >
          Previous
        </button>
        <span className="history-pagination-info">
          {total === 0 ? 'No rows' : `${formatNumber(first)}–${formatNumber(last)} of ${formatNumber(total)}`}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onPage(page + 1)}
          disabled={last >= total}
        >
          Next
        </button>
      </div>
    </>
  );
}

const USAGE_VIEWS = [
  ['users', 'By user'],
  ['periods', 'By period'],
  ['matrix', 'User × period'],
  ['breakdown', 'Profiles & models'],
  ['log', 'Raw log'],
];

function AdminPage() {
  const { user } = useAuth();

  // --- OpenAI keys ---
  // The server only ever sends back a masked key, so the inputs start empty:
  // typing a value replaces that key, leaving it blank keeps the current one.
  const [keys, setKeys] = useState(null);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keysSaving, setKeysSaving] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [adminKeyInput, setAdminKeyInput] = useState('');
  const [keysMessage, setKeysMessage] = useState({ type: '', text: '' });

  // --- OpenAI spend ---
  const [spend, setSpend] = useState(null);
  const [spendLoading, setSpendLoading] = useState(false);

  // --- Per-user usage (from the usage sheet) ---
  // `filters` is the single source of truth for what the whole panel is showing; the
  // server does every roll-up, so changing one of these is one request, not a re-count
  // in the browser. `searchInput` is separate so typing debounces into filters.search.
  const [usage, setUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [sheetConnecting, setSheetConnecting] = useState(false);
  const [usageMessage, setUsageMessage] = useState({ type: '', text: '' });
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [logPage, setLogPage] = useState(0);
  const [view, setView] = useState('users');

  // --- Users / roles ---
  // A page at a time, filtered by the server: the panel opens at the same speed with
  // five users as with five thousand, and never holds the whole directory in the tab.
  const [users, setUsers] = useState([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userTotalUnfiltered, setUserTotalUnfiltered] = useState(0);
  const [userPage, setUserPage] = useState(0);
  const [userSearchInput, setUserSearchInput] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [savingSub, setSavingSub] = useState(null);

  // --- Profile assignment ---
  // allProfiles is every candidate profile in the system (admins see the full list).
  // editingSub is the user whose assignment panel is open; draft holds the checked names.
  const [allProfiles, setAllProfiles] = useState([]);
  const [editingSub, setEditingSub] = useState(null);
  const [draftProfiles, setDraftProfiles] = useState([]);
  const [assigningSub, setAssigningSub] = useState(null);

  const loadKeys = async () => {
    setKeysLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/admin/settings/openai-keys`);
      setKeys(res.data.keys || null);
    } catch (err) {
      setKeysMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to load OpenAI keys.' });
    } finally {
      setKeysLoading(false);
    }
  };

  const saveKeys = async (e) => {
    e.preventDefault();
    // Only send the fields the admin actually typed into — an untouched field must
    // not clear the key that's already set.
    const payload = {};
    if (apiKeyInput.trim()) payload.openai_api_key = apiKeyInput.trim();
    if (adminKeyInput.trim()) payload.openai_admin_key = adminKeyInput.trim();
    if (Object.keys(payload).length === 0) {
      setKeysMessage({ type: 'error', text: 'Enter a new key to save.' });
      return;
    }
    setKeysSaving(true);
    setKeysMessage({ type: '', text: '' });
    try {
      const res = await axios.put(`${API_BASE_URL}/api/admin/settings/openai-keys`, payload);
      setKeys(res.data.keys || null);
      setApiKeyInput('');
      setAdminKeyInput('');
      setKeysMessage({ type: 'success', text: 'Saved. New keys take effect immediately — no restart needed.' });
      // The spend panel depends on the admin key, so re-read it with the new one.
      if (payload.openai_admin_key) loadSpend();
    } catch (err) {
      setKeysMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to save OpenAI keys.' });
    } finally {
      setKeysSaving(false);
    }
  };

  // Clearing an override drops back to whatever is in backend/.env.
  const clearKey = async (name, label) => {
    setKeysSaving(true);
    setKeysMessage({ type: '', text: '' });
    try {
      const res = await axios.put(`${API_BASE_URL}/api/admin/settings/openai-keys`, { [name]: '' });
      setKeys(res.data.keys || null);
      setKeysMessage({ type: 'info', text: `${label} cleared. Falling back to backend/.env.` });
      if (name === 'openai_admin_key') loadSpend();
    } catch (err) {
      setKeysMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to clear key.' });
    } finally {
      setKeysSaving(false);
    }
  };

  const loadSpend = async () => {
    setSpendLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/admin/openai-spend`);
      setSpend(res.data);
    } catch (err) {
      setSpend({ available: false, error: err.response?.data?.detail || 'Failed to load spend.' });
    } finally {
      setSpendLoading(false);
    }
  };

  // Only the non-empty filters are sent: a blank one means "no filter", and the
  // backend would otherwise have to guess which blanks were deliberate.
  const activeFilters = useMemo(() => {
    const params = {};
    ['date_from', 'date_to', 'user_sub', 'profile', 'action', 'search'].forEach((key) => {
      if (filters[key]) params[key] = filters[key];
    });
    return params;
  }, [filters]);

  const hasFilters = Object.keys(activeFilters).length > 0;
  const rangeActive = !!(filters.date_from || filters.date_to);

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/admin/usage`, {
        params: {
          ...activeFilters,
          group_by: filters.group_by,
          limit: LOG_PAGE_SIZE,
          offset: logPage * LOG_PAGE_SIZE,
        },
      });
      setUsage(res.data);
    } catch (err) {
      setUsageMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to load usage.' });
    } finally {
      setUsageLoading(false);
    }
  }, [activeFilters, filters.group_by, logPage]);

  // Any filter change is a new question for the server, so re-ask it. Paging the log
  // is in here too — the page offset is part of the request.
  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  // Typing in the search box shouldn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      setFilters((current) => (current.search === next ? current : { ...current, search: next }));
      setLogPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Changing what is being asked for invalidates the page you were on.
  const setFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setLogPage(0);
  };

  const setRange = (from, to) => {
    setFilters((current) => ({ ...current, date_from: from, date_to: to }));
    setLogPage(0);
  };

  const clearFilters = () => {
    setFilters((current) => ({ ...EMPTY_FILTERS, group_by: current.group_by }));
    setSearchInput('');
    setLogPage(0);
  };

  const exportUsage = async () => {
    setExporting(true);
    setUsageMessage({ type: '', text: '' });
    try {
      const res = await axios.get(`${API_BASE_URL}/api/admin/usage/export`, {
        params: activeFilters,
        responseType: 'blob',
      });
      saveBlob(res.data, `usage_${utcToday()}.csv`, 'text/csv');
    } catch (err) {
      setUsageMessage({ type: 'error', text: await blobErrorDetail(err, 'Failed to export usage.') });
    } finally {
      setExporting(false);
    }
  };

  // Creates the usage spreadsheet in this admin's own Drive, so it needs their
  // Drive connection — not just their admin role.
  const connectSheet = async () => {
    setSheetConnecting(true);
    setUsageMessage({ type: '', text: '' });
    try {
      await axios.post(`${API_BASE_URL}/api/admin/usage/sheet`);
      setUsageMessage({ type: 'success', text: 'Usage sheet created in your Drive. New generations will be logged to it.' });
      loadUsage();
    } catch (err) {
      setUsageMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to create the usage sheet.' });
    } finally {
      setSheetConnecting(false);
    }
  };

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = { limit: USER_PAGE_SIZE, offset: userPage * USER_PAGE_SIZE };
      if (userSearch) params.search = userSearch;
      const res = await axios.get(`${API_BASE_URL}/api/admin/users`, { params });
      setUsers(res.data.users || []);
      setUserTotal(res.data.total || 0);
      setUserTotalUnfiltered(res.data.total_unfiltered || 0);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to load users.' });
    } finally {
      setUsersLoading(false);
    }
  }, [userPage, userSearch]);

  // A request per keystroke would be one per letter of an email address.
  useEffect(() => {
    if (userSearchInput === userSearch) return undefined;
    const timer = setTimeout(() => {
      setUserSearch(userSearchInput);
      setUserPage(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [userSearchInput, userSearch]);

  // As an admin, /api/profiles returns every profile — the full menu to assign from.
  const loadAllProfiles = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/profiles`);
      setAllProfiles(res.data.profiles || []);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to load candidate profiles.' });
    }
  };

  // Usage is loaded by its own effect above — it re-runs whenever the filters change,
  // and firing it here too would just double the first request.
  useEffect(() => {
    loadKeys();
    loadSpend();
    loadAllProfiles();
  }, []);

  // Users reload whenever their page or search changes; firing it above too would just
  // double the first request.
  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const openAssign = (target) => {
    setEditingSub(target.sub);
    setDraftProfiles(target.assigned_profiles || []);
    setMessage({ type: '', text: '' });
  };

  const toggleDraftProfile = (name) => {
    setDraftProfiles((current) =>
      current.includes(name) ? current.filter((n) => n !== name) : [...current, name]
    );
  };

  // Sends the complete list — an empty one revokes every profile from the user.
  const saveAssignment = async (target) => {
    setAssigningSub(target.sub);
    setMessage({ type: '', text: '' });
    try {
      const res = await axios.put(
        `${API_BASE_URL}/api/admin/users/${encodeURIComponent(target.sub)}/profiles`,
        { profiles: draftProfiles }
      );
      setMessage({ type: 'success', text: res.data.message || 'Profiles assigned.' });
      setEditingSub(null);
      loadUsers();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to assign profiles.' });
    } finally {
      setAssigningSub(null);
    }
  };

  const changeRole = async (target, role) => {
    setSavingSub(target.sub);
    setMessage({ type: '', text: '' });
    try {
      await axios.put(`${API_BASE_URL}/api/admin/users/${encodeURIComponent(target.sub)}/role`, { role });
      setMessage({ type: 'success', text: `${target.name || target.email} is now ${role}.` });
      loadUsers();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to update role.' });
    } finally {
      setSavingSub(null);
    }
  };

  return (
    <div className="container">
      <h1 className="app-title">Admin</h1>
      <p className="app-subtitle">
        Manage OpenAI keys and user roles, and review API spend. Only admins can see this page.
      </p>

      {/* OpenAI keys */}
      <div className="card">
        <h2 className="section-title">OpenAI keys</h2>
        <p className="section-desc">
          The <strong>API key</strong> generates resumes and cover letters. The <strong>Admin key</strong> (
          <code>sk-admin-…</code>) is only used to read org spend below. Keys saved here override{' '}
          <code>backend/.env</code> and take effect on the next request — no restart. For security, existing keys are
          only ever shown masked.
        </p>

        {keysMessage.text && <div className={`alert alert-${keysMessage.type}`}>{keysMessage.text}</div>}

        <form onSubmit={saveKeys}>
          <div className="form-group">
            <label className="form-label" htmlFor="openai-api-key">
              OpenAI API key
              {keys?.openai_api_key?.is_set ? (
                <span className="muted small">
                  {' '}— current: <code>{keys.openai_api_key.masked}</code>{' '}
                  {keys.openai_api_key.source === 'env' ? '(from .env)' : '(set here)'}
                </span>
              ) : (
                <span className="muted small"> — not set</span>
              )}
            </label>
            <div className="drive-status">
              <input
                id="openai-api-key"
                type="password"
                className="form-input"
                placeholder={keys?.openai_api_key?.is_set ? 'Enter a new key to replace it' : 'sk-…'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                autoComplete="off"
              />
              {keys?.openai_api_key?.source === 'settings' && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => clearKey('openai_api_key', 'OpenAI API key')}
                  disabled={keysSaving}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="openai-admin-key">
              OpenAI Admin key
              {keys?.openai_admin_key?.is_set ? (
                <span className="muted small">
                  {' '}— current: <code>{keys.openai_admin_key.masked}</code>{' '}
                  {keys.openai_admin_key.source === 'env' ? '(from .env)' : '(set here)'}
                </span>
              ) : (
                <span className="muted small"> — not set</span>
              )}
            </label>
            <div className="drive-status">
              <input
                id="openai-admin-key"
                type="password"
                className="form-input"
                placeholder={keys?.openai_admin_key?.is_set ? 'Enter a new key to replace it' : 'sk-admin-…'}
                value={adminKeyInput}
                onChange={(e) => setAdminKeyInput(e.target.value)}
                autoComplete="off"
              />
              {keys?.openai_admin_key?.source === 'settings' && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => clearKey('openai_admin_key', 'OpenAI Admin key')}
                  disabled={keysSaving}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-sm" disabled={keysSaving || keysLoading}>
            {keysSaving ? 'Saving…' : 'Save keys'}
          </button>
        </form>
      </div>

      {/* OpenAI spend */}
      <div className="card">
        <h2 className="section-title">OpenAI API spend</h2>
        <p className="section-desc">
          OpenAI does not expose a remaining-balance figure via the API. This shows money{' '}
          <strong>spent</strong> (via the Costs API) and requires an Admin key (<code>sk-admin-…</code>) set as{' '}
          <code>OPENAI_ADMIN_KEY</code> in <code>backend/.env</code>.
        </p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={loadSpend} disabled={spendLoading}>
          {spendLoading ? 'Loading…' : 'Refresh spend'}
        </button>

        {spend && spend.available && (
          <div className="admin-spend-grid">
            <div className="admin-spend-tile">
              <span className="admin-spend-label">Month to date</span>
              <span className="admin-spend-value">{formatMoney(spend.month_to_date, spend.currency)}</span>
              <span className="muted small">since {formatDate(spend.month_start)}</span>
            </div>
            <div className="admin-spend-tile">
              <span className="admin-spend-label">Today</span>
              <span className="admin-spend-value">{formatMoney(spend.today, spend.currency)}</span>
            </div>
          </div>
        )}
        {spend && !spend.available && (
          <div className="alert alert-info" style={{ marginTop: '1rem' }}>
            {spend.error || 'OpenAI spend is unavailable.'}
          </div>
        )}
      </div>

      {/* Usage & governance */}
      <div className="card">
        <h2 className="section-title">Usage &amp; governance</h2>
        <p className="section-desc">
          Every generation is logged with the tokens it used and what they cost. Slice it by user, profile, source
          or model, over any date range, rolled up per day, week or month — and export exactly what you are looking
          at. Dates and totals are <strong>UTC</strong>, matching the log itself. Costs are <strong>estimated</strong>{' '}
          from the recorded token counts — OpenAI&apos;s Costs API above reports one org-wide total and cannot break
          spend down by user, so expect the two to be close but not identical.
        </p>

        {usageMessage.text && <div className={`alert alert-${usageMessage.type}`}>{usageMessage.text}</div>}

        {usage && !usage.connected ? (
          <>
            <div className="alert alert-info">
              No usage sheet yet. Create one in your Google Drive to start logging. You must have connected Drive first.
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={connectSheet} disabled={sheetConnecting}>
              {sheetConnecting ? 'Creating…' : 'Create usage sheet'}
            </button>
          </>
        ) : (
          <>
            <div className="drive-status">
              <button type="button" className="btn btn-secondary btn-sm" onClick={loadUsage} disabled={usageLoading}>
                {usageLoading ? 'Loading…' : 'Refresh'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={exportUsage}
                disabled={exporting || !usage?.connected}
              >
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
              {usage?.sheet?.sheet_link && (
                <a
                  className="btn btn-secondary btn-sm"
                  href={usage.sheet.sheet_link}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open usage sheet
                </a>
              )}
              {usage?.sheet?.pending_writes > 0 && (
                <span className="muted small">{usage.sheet.pending_writes} row(s) still being written…</span>
              )}
              {usage?.generated_at && (
                <span className="muted small">As of {formatTimestamp(usage.generated_at)}</span>
              )}
            </div>

            {/* Filters — every one of them re-asks the server, so the figures below
                always agree with each other. */}
            <div className="usage-filters">
              <div className="usage-filter">
                <span className="usage-filter-label">Group by</span>
                <div className="usage-segmented">
                  {['day', 'week', 'month'].map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`usage-segment${filters.group_by === g ? ' usage-segment-active' : ''}`}
                      onClick={() => setFilter('group_by', g)}
                    >
                      {g === 'day' ? 'Day' : g === 'week' ? 'Week' : 'Month'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="usage-filter">
                <span className="usage-filter-label">Range</span>
                <div className="usage-quick-ranges">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRange(utcToday(), utcToday())}>
                    Today
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRange(utcWeekStart(), '')}>
                    This week
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRange(utcMonthStart(), '')}>
                    This month
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRange(utcDaysAgo(29), '')}>
                    Last 30 days
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRange('', '')}>
                    All time
                  </button>
                </div>
              </div>

              <div className="usage-filter">
                <span className="usage-filter-label">From</span>
                <input
                  type="date"
                  className="history-date-input"
                  value={filters.date_from}
                  onChange={(e) => setFilter('date_from', e.target.value)}
                />
              </div>
              <div className="usage-filter">
                <span className="usage-filter-label">To</span>
                <input
                  type="date"
                  className="history-date-input"
                  value={filters.date_to}
                  onChange={(e) => setFilter('date_to', e.target.value)}
                />
              </div>

              <div className="usage-filter">
                <span className="usage-filter-label">User</span>
                <select
                  className="form-input"
                  value={filters.user_sub}
                  onChange={(e) => setFilter('user_sub', e.target.value)}
                >
                  <option value="">All users</option>
                  {(usage?.options?.users || []).map((u) => (
                    <option key={u.sub} value={u.sub}>
                      {u.name || u.email || u.sub}
                    </option>
                  ))}
                </select>
              </div>

              <div className="usage-filter">
                <span className="usage-filter-label">Profile</span>
                <select
                  className="form-input"
                  value={filters.profile}
                  onChange={(e) => setFilter('profile', e.target.value)}
                >
                  <option value="">All profiles</option>
                  {(usage?.options?.profiles || []).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div className="usage-filter">
                <span className="usage-filter-label">Source</span>
                <select
                  className="form-input"
                  value={filters.action}
                  onChange={(e) => setFilter('action', e.target.value)}
                >
                  <option value="">Any source</option>
                  {(usage?.options?.actions || []).map((a) => (
                    <option key={a} value={a}>
                      {a === 'job_url' ? 'Job link' : a === 'job_description' ? 'JD file' : a}
                    </option>
                  ))}
                </select>
              </div>

              <div className="usage-filter usage-filter-grow">
                <span className="usage-filter-label">Search</span>
                <input
                  type="search"
                  className="form-input"
                  placeholder="Company, role, email, model or URL"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>

              {hasFilters && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>

            {usage?.totals && (
              <div className="admin-spend-grid">
                <UsageTile label="Today" tally={usage.totals.today} />
                <UsageTile label="This week" tally={usage.totals.week} hint={`from ${usage.period_starts?.week}`} />
                <UsageTile label="This month" tally={usage.totals.month} hint={`from ${usage.period_starts?.month}`} />
                <UsageTile label="All time" tally={usage.totals.all_time} />
                {rangeActive && (
                  <UsageTile
                    label="Selected range"
                    tally={usage.totals.range}
                    hint={`${filters.date_from || 'start'} → ${filters.date_to || 'today'}`}
                    emphasis
                  />
                )}
              </div>
            )}
            {usage?.totals && (
              <p className="muted small">
                The four tiles above always report now, whatever range is selected; everything below them is the
                filtered range.
              </p>
            )}

            <div className="usage-views">
              {USAGE_VIEWS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`usage-view${view === key ? ' usage-view-active' : ''}`}
                  onClick={() => setView(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            {!usage ? (
              <p className="muted">{usageLoading ? 'Loading usage…' : 'Nothing generated yet.'}</p>
            ) : (
              <>
                {view === 'users' && (
                  <UsageUserTable
                    users={usage.users}
                    rangeActive={rangeActive}
                    activeSub={filters.user_sub}
                    onFocusUser={(sub) => setFilter('user_sub', sub)}
                  />
                )}
                {view === 'periods' && <UsagePeriodTable series={usage.series} groupBy={usage.group_by} />}
                {view === 'matrix' && <UsageMatrix matrix={usage.matrix} groupBy={usage.group_by} />}
                {view === 'breakdown' && (
                  <div className="usage-breakdown-grid">
                    <UsageBreakdown
                      title="Profile"
                      field="profile"
                      rows={usage.profiles}
                      onSelect={(value) => setFilter('profile', value)}
                    />
                    <UsageBreakdown title="Source" field="action" rows={usage.actions} />
                    <UsageBreakdown title="Model" field="model" rows={usage.models} />
                  </div>
                )}
                {view === 'log' && <UsageLog rows={usage.rows} page={logPage} onPage={setLogPage} />}
              </>
            )}
          </>
        )}
      </div>

      {/* Backend logs */}
      <LogsPanel />

      {/* Users / roles */}
      <div className="card">
        <h2 className="section-title">Users &amp; roles</h2>
        <p className="section-desc">
          Admins can do everything and see this page, including using every candidate profile. Users can generate
          resumes and view logs, but cannot manage roles or profiles — they can only use the profiles you assign to them
          here. A user with none assigned sees an empty picker telling them to ask an administrator.
        </p>
        {message.text && <div className={`alert alert-${message.type}`}>{message.text}</div>}

        <div className="history-toolbar">
          <button type="button" className="btn btn-secondary btn-sm" onClick={loadUsers} disabled={usersLoading}>
            {usersLoading ? 'Loading…' : 'Refresh users'}
          </button>
          {/* Searches every user, not the page on screen. */}
          <input
            type="search"
            className="history-search-input"
            placeholder="Search name or email"
            value={userSearchInput}
            onChange={(e) => setUserSearchInput(e.target.value)}
          />
          {userSearchInput && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => { setUserSearchInput(''); setUserSearch(''); setUserPage(0); }}
            >
              Clear
            </button>
          )}
        </div>

        {users.length === 0 ? (
          <p className="muted">
            {usersLoading
              ? 'Loading users…'
              : userTotalUnfiltered === 0
                ? 'No users yet.'
                : 'No users match that search.'}
          </p>
        ) : (
          <div className="history-table-wrapper">
            <table className="history-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Assigned profiles</th>
                  <th>Last login</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.sub === user.sub;
                  const locked = u.is_env_admin;
                  const isAdminUser = u.role === 'admin';
                  const assigned = u.assigned_profiles || [];
                  return (
                    <React.Fragment key={u.sub}>
                      <tr>
                        <td>{u.name || '—'}{isSelf && <span className="badge badge-builtin">you</span>}</td>
                        <td>{u.email}</td>
                        <td>
                          {isAdminUser
                            ? <span className="badge badge-custom">admin</span>
                            : <span className="badge badge-builtin">user</span>}
                          {locked && <span className="muted small"> (via ADMIN_EMAILS)</span>}
                        </td>
                        <td>
                          {isAdminUser ? (
                            <span className="muted small">All (admin)</span>
                          ) : (
                            <>
                              {assigned.length > 0 ? (
                                <span>{assigned.join(', ')}</span>
                              ) : (
                                <span className="muted small">None assigned</span>
                              )}
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => (editingSub === u.sub ? setEditingSub(null) : openAssign(u))}
                              >
                                {editingSub === u.sub ? 'Cancel' : 'Assign'}
                              </button>
                            </>
                          )}
                        </td>
                        <td>{formatDate(u.last_login_at)}</td>
                        <td>
                          {isSelf ? (
                            <span className="muted small">—</span>
                          ) : locked ? (
                            <span className="muted small">Locked</span>
                          ) : isAdminUser ? (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => changeRole(u, 'user')}
                              disabled={savingSub === u.sub}
                            >
                              {savingSub === u.sub ? 'Saving…' : 'Demote to user'}
                            </button>
                          ) : (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => changeRole(u, 'admin')}
                              disabled={savingSub === u.sub}
                            >
                              {savingSub === u.sub ? 'Saving…' : 'Make admin'}
                            </button>
                          )}
                        </td>
                      </tr>

                      {editingSub === u.sub && (
                        <tr>
                          <td colSpan={6}>
                            {allProfiles.length === 0 ? (
                              <p className="muted">
                                No candidate profiles exist yet. Create one on the Manage Profiles page first.
                              </p>
                            ) : (
                              <>
                                <p className="muted small">
                                  Tick the profiles {u.name || u.email} may generate with. Unticking everything revokes
                                  their access.
                                </p>
                                <div className="profile-assign-grid">
                                  {allProfiles.map((name) => (
                                    <label key={name} className="profile-assign-option">
                                      <input
                                        type="checkbox"
                                        checked={draftProfiles.includes(name)}
                                        onChange={() => toggleDraftProfile(name)}
                                      />
                                      <span>{name}</span>
                                    </label>
                                  ))}
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                                  <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => saveAssignment(u)}
                                    disabled={assigningSub === u.sub}
                                  >
                                    {assigningSub === u.sub ? 'Saving…' : 'Save assignment'}
                                  </button>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setEditingSub(null)}
                                    disabled={assigningSub === u.sub}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {userTotal > USER_PAGE_SIZE && (
          <div className="log-pager">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={userPage === 0 || usersLoading}
              onClick={() => setUserPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </button>
            <span className="muted small">
              Page {userPage + 1} of {Math.ceil(userTotal / USER_PAGE_SIZE)} ({userTotal} users)
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={(userPage + 1) * USER_PAGE_SIZE >= userTotal || usersLoading}
              onClick={() => setUserPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminPage;
