import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth, API_BASE_URL } from './auth';

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
  const [usage, setUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [sheetConnecting, setSheetConnecting] = useState(false);
  const [usageMessage, setUsageMessage] = useState({ type: '', text: '' });

  // --- Users / roles ---
  const [users, setUsers] = useState([]);
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

  const loadUsage = async () => {
    setUsageLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/admin/usage`);
      setUsage(res.data);
    } catch (err) {
      setUsageMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to load usage.' });
    } finally {
      setUsageLoading(false);
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

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/admin/users`);
      setUsers(res.data.users || []);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to load users.' });
    } finally {
      setUsersLoading(false);
    }
  };

  // As an admin, /api/profiles returns every profile — the full menu to assign from.
  const loadAllProfiles = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/profiles`);
      setAllProfiles(res.data.profiles || []);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to load candidate profiles.' });
    }
  };

  useEffect(() => {
    loadKeys();
    loadSpend();
    loadUsage();
    loadUsers();
    loadAllProfiles();
  }, []);

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

      {/* Per-user usage */}
      <div className="card">
        <h2 className="section-title">Usage by user</h2>
        <p className="section-desc">
          Every generation is logged to a Google Sheet with the tokens it used and what they cost. Costs are{' '}
          <strong>estimated</strong> from those token counts — OpenAI&apos;s Costs API above reports one org-wide total
          and cannot break spend down by user, so expect the two to be close but not identical.
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
                {usageLoading ? 'Loading…' : 'Refresh usage'}
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
            </div>

            {usage?.totals && (
              <div className="admin-spend-grid">
                <div className="admin-spend-tile">
                  <span className="admin-spend-label">Today</span>
                  <span className="admin-spend-value">{formatMoney(usage.totals.today_cost_usd, 'usd')}</span>
                  <span className="muted small">{formatNumber(usage.totals.today_generations)} generations</span>
                </div>
                <div className="admin-spend-tile">
                  <span className="admin-spend-label">All time</span>
                  <span className="admin-spend-value">{formatMoney(usage.totals.cost_usd, 'usd')}</span>
                  <span className="muted small">
                    {formatNumber(usage.totals.generations)} generations ·{' '}
                    {formatNumber(usage.totals.total_tokens)} tokens
                  </span>
                </div>
              </div>
            )}

            {usage?.users?.length ? (
              <div className="history-table-wrapper">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Today</th>
                      <th>Today cost</th>
                      <th>Total</th>
                      <th>Tokens</th>
                      <th>Total cost</th>
                      <th>Last generated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.users.map((u) => (
                      <tr key={u.sub}>
                        <td>{u.name || '—'}</td>
                        <td>{u.email || '—'}</td>
                        <td>{formatNumber(u.today_generations)}</td>
                        <td>{formatMoney(u.today_cost_usd, 'usd')}</td>
                        <td>{formatNumber(u.generations)}</td>
                        <td>{formatNumber(u.total_tokens)}</td>
                        <td>{formatMoney(u.cost_usd, 'usd')}</td>
                        <td>{formatTimestamp(u.last_used_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">{usageLoading ? 'Loading usage…' : 'Nothing generated yet.'}</p>
            )}

            {usage?.daily?.length > 0 && (
              <>
                <h3 className="section-title" style={{ fontSize: '1rem', marginTop: '1.5rem' }}>
                  Daily totals
                </h3>
                <div className="history-table-wrapper">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Generations</th>
                        <th>Tokens</th>
                        <th>Est. cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...usage.daily].reverse().map((d) => (
                        <tr key={d.date}>
                          <td>{d.date}</td>
                          <td>{formatNumber(d.generations)}</td>
                          <td>{formatNumber(d.total_tokens)}</td>
                          <td>{formatMoney(d.cost_usd, 'usd')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Users / roles */}
      <div className="card">
        <h2 className="section-title">Users &amp; roles</h2>
        <p className="section-desc">
          Admins can do everything and see this page, including using every candidate profile. Users can generate
          resumes and view logs, but cannot manage roles or profiles — they can only use the profiles you assign to them
          here. A user with none assigned sees an empty picker telling them to ask an administrator.
        </p>
        {message.text && <div className={`alert alert-${message.type}`}>{message.text}</div>}

        <button type="button" className="btn btn-secondary btn-sm" onClick={loadUsers} disabled={usersLoading}>
          {usersLoading ? 'Loading…' : 'Refresh users'}
        </button>

        {users.length === 0 ? (
          <p className="muted">{usersLoading ? 'Loading users…' : 'No users yet.'}</p>
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
      </div>
    </div>
  );
}

export default AdminPage;
