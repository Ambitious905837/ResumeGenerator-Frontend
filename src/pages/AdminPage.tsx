import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  BarChart3,
  CircleDollarSign,
  Download,
  ExternalLink,
  FilterX,
  KeyRound,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sheet as SheetIcon,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react';
import { useAuth, API_BASE_URL } from '../auth';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { blobErrorDetail, errorDetail, saveBlob } from '../lib/download';
import { notify } from '../lib/notify';
import {
  formatCompact,
  formatEpoch,
  formatMoney,
  formatNumber,
  formatTimestamp,
  plural,
  utcDaysAgo,
  utcMonthStart,
  utcToday,
  utcWeekStart,
} from '../lib/format';
import type {
  AdminUser,
  OpenAIKeys,
  OpenAISpend,
  Role,
  UsageResponse,
  UsageTally,
} from '../types/api';
import { PageHeader } from '../components/AppShell';
import { LogsPanel } from '../components/LogsPanel';
import {
  sourceLabel,
  UsageBreakdown,
  UsageLog,
  UsageMatrix,
  UsagePeriodTable,
  UsageUserTable,
} from '../components/admin/UsageViews';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardBody, CardHeader } from '../components/ui/card';
import { CheckboxField } from '../components/ui/checkbox';
import { ConfirmDialog } from '../components/ui/dialog';
import { Field, FilterLabel, Input, SearchInput, Select } from '../components/ui/field';
import { EmptyState, TableSkeleton } from '../components/ui/feedback';
import { SimplePager } from '../components/ui/pagination';
import { Segmented } from '../components/ui/segmented';
import { Stat, StatGrid } from '../components/ui/stat';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '../components/ui/table';
import { Tooltip } from '../components/ui/tooltip';

// Rows shown per page in the raw usage log. The aggregates above it always cover the
// whole filtered set — only this table is paged.
const LOG_PAGE_SIZE = 25;
const USER_PAGE_SIZE = 20;

interface UsageFilters {
  group_by: 'day' | 'week' | 'month';
  date_from: string;
  date_to: string;
  user_sub: string;
  profile: string;
  action: string;
  search: string;
}

const EMPTY_FILTERS: UsageFilters = {
  group_by: 'day',
  date_from: '',
  date_to: '',
  user_sub: '',
  profile: '',
  action: '',
  search: '',
};

type UsageView = 'users' | 'periods' | 'matrix' | 'breakdown' | 'log';

const USAGE_VIEWS: Array<{ value: UsageView; label: string; hint: string }> = [
  { value: 'users', label: 'By user', hint: 'Totals per person across every window' },
  { value: 'periods', label: 'By period', hint: 'One row per day, week or month' },
  { value: 'matrix', label: 'User × period', hint: 'Who generated what, when' },
  { value: 'breakdown', label: 'Profiles & models', hint: 'Grouped by profile, source and model' },
  { value: 'log', label: 'Raw log', hint: 'One row per generation, as recorded' },
];

const GROUP_OPTIONS = [
  { value: 'day' as const, label: 'Day' },
  { value: 'week' as const, label: 'Week' },
  { value: 'month' as const, label: 'Month' },
];

/** The secondary line under a usage headline figure. */
function tallySub(tally?: UsageTally): string {
  const t = tally || { generations: 0, cost_usd: 0, total_tokens: 0 };
  return `${formatMoney(t.cost_usd)} · ${formatCompact(t.total_tokens)} tokens${
    t.users !== undefined ? ` · ${formatNumber(t.users)} ${plural(t.users, 'user')}` : ''
  }`;
}

export default function AdminPage() {
  const { user } = useAuth();

  // --- OpenAI keys ---
  // The server only ever sends back a masked key, so the inputs start empty:
  // typing a value replaces that key, leaving it blank keeps the current one.
  const [keys, setKeys] = useState<OpenAIKeys | null>(null);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keysSaving, setKeysSaving] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [adminKeyInput, setAdminKeyInput] = useState('');

  // --- OpenAI spend ---
  const [spend, setSpend] = useState<OpenAISpend | null>(null);
  const [spendLoading, setSpendLoading] = useState(false);

  // --- Per-user usage (from the usage sheet) ---
  // `filters` is the single source of truth for what the whole panel is showing; the
  // server does every roll-up, so changing one of these is one request, not a re-count
  // in the browser. `searchInput` is separate so typing debounces into filters.search.
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [sheetConnecting, setSheetConnecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<UsageFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [logPage, setLogPage] = useState(0);
  const [view, setView] = useState<UsageView>('users');

  // --- Users / roles ---
  // A page at a time, filtered by the server: the panel opens at the same speed with
  // five users as with five thousand, and never holds the whole directory in the tab.
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userTotalUnfiltered, setUserTotalUnfiltered] = useState(0);
  const [userPage, setUserPage] = useState(0);
  const [userSearchInput, setUserSearchInput] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);
  const [savingSub, setSavingSub] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<{ target: AdminUser; role: Role } | null>(null);

  // --- Profile assignment ---
  // allProfiles is every candidate profile in the system (admins see the full list).
  // editingSub is the user whose assignment panel is open; draft holds the checked names.
  const [allProfiles, setAllProfiles] = useState<string[]>([]);
  const [editingSub, setEditingSub] = useState<string | null>(null);
  const [draftProfiles, setDraftProfiles] = useState<string[]>([]);
  const [assigningSub, setAssigningSub] = useState<string | null>(null);

  const userSearch = useDebouncedValue(userSearchInput, 350);
  const debouncedSearch = useDebouncedValue(searchInput, 400);

  // --- OpenAI keys ---------------------------------------------------------

  const loadKeys = useCallback(async () => {
    setKeysLoading(true);
    try {
      const res = await axios.get<{ keys?: OpenAIKeys }>(
        `${API_BASE_URL}/api/admin/settings/openai-keys`
      );
      setKeys(res.data.keys || null);
    } catch (err) {
      notify.error(errorDetail(err, 'Failed to load OpenAI keys.'));
    } finally {
      setKeysLoading(false);
    }
  }, []);

  const loadSpend = useCallback(async () => {
    setSpendLoading(true);
    try {
      const res = await axios.get<OpenAISpend>(`${API_BASE_URL}/api/admin/openai-spend`);
      setSpend(res.data);
    } catch (err) {
      setSpend({ available: false, error: errorDetail(err, 'Failed to load spend.') });
    } finally {
      setSpendLoading(false);
    }
  }, []);

  const saveKeys = async (event: React.FormEvent) => {
    event.preventDefault();
    // Only send the fields the admin actually typed into — an untouched field must
    // not clear the key that's already set.
    const payload: Record<string, string> = {};
    if (apiKeyInput.trim()) payload.openai_api_key = apiKeyInput.trim();
    if (adminKeyInput.trim()) payload.openai_admin_key = adminKeyInput.trim();
    if (Object.keys(payload).length === 0) {
      notify.error('Enter a new key to save.');
      return;
    }
    setKeysSaving(true);
    try {
      const res = await axios.put<{ keys?: OpenAIKeys }>(
        `${API_BASE_URL}/api/admin/settings/openai-keys`,
        payload
      );
      setKeys(res.data.keys || null);
      setApiKeyInput('');
      setAdminKeyInput('');
      notify.success('Keys saved.', 'They take effect on the next request — no restart needed.');
      // The spend panel depends on the admin key, so re-read it with the new one.
      if (payload.openai_admin_key) loadSpend();
    } catch (err) {
      notify.error(errorDetail(err, 'Failed to save OpenAI keys.'));
    } finally {
      setKeysSaving(false);
    }
  };

  /** Clearing an override drops back to whatever is in backend/.env. */
  const clearKey = async (name: 'openai_api_key' | 'openai_admin_key', label: string) => {
    setKeysSaving(true);
    try {
      const res = await axios.put<{ keys?: OpenAIKeys }>(
        `${API_BASE_URL}/api/admin/settings/openai-keys`,
        { [name]: '' }
      );
      setKeys(res.data.keys || null);
      notify.info(`${label} cleared.`, 'Falling back to backend/.env.');
      if (name === 'openai_admin_key') loadSpend();
    } catch (err) {
      notify.error(errorDetail(err, 'Failed to clear key.'));
    } finally {
      setKeysSaving(false);
    }
  };

  // --- Usage ----------------------------------------------------------------

  // Only the non-empty filters are sent: a blank one means "no filter", and the
  // backend would otherwise have to guess which blanks were deliberate.
  const activeFilters = useMemo(() => {
    const params: Record<string, string> = {};
    (['date_from', 'date_to', 'user_sub', 'profile', 'action', 'search'] as const).forEach((key) => {
      if (filters[key]) params[key] = filters[key];
    });
    return params;
  }, [filters]);

  const hasFilters = Object.keys(activeFilters).length > 0;
  const rangeActive = !!(filters.date_from || filters.date_to);

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    try {
      const res = await axios.get<UsageResponse>(`${API_BASE_URL}/api/admin/usage`, {
        params: {
          ...activeFilters,
          group_by: filters.group_by,
          limit: LOG_PAGE_SIZE,
          offset: logPage * LOG_PAGE_SIZE,
        },
      });
      setUsage(res.data);
    } catch (err) {
      notify.error(errorDetail(err, 'Failed to load usage.'));
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
    const next = debouncedSearch.trim();
    setFilters((current) => (current.search === next ? current : { ...current, search: next }));
    setLogPage(0);
  }, [debouncedSearch]);

  // Changing what is being asked for invalidates the page you were on.
  const setFilter = <K extends keyof UsageFilters>(key: K, value: UsageFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setLogPage(0);
  };

  const setRange = (from: string, to: string) => {
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
    try {
      const res = await axios.get(`${API_BASE_URL}/api/admin/usage/export`, {
        params: activeFilters,
        responseType: 'blob',
      });
      saveBlob(res.data, `usage_${utcToday()}.csv`, 'text/csv');
      notify.success('Export ready.', 'The CSV covers exactly what the filters above are showing.');
    } catch (err) {
      notify.error(await blobErrorDetail(err, 'Failed to export usage.'));
    } finally {
      setExporting(false);
    }
  };

  // Creates the usage spreadsheet in this admin's own Drive, so it needs their
  // Drive connection — not just their admin role.
  const connectSheet = async () => {
    setSheetConnecting(true);
    try {
      await axios.post(`${API_BASE_URL}/api/admin/usage/sheet`);
      notify.success(
        'Usage sheet created in your Drive.',
        'New generations will be logged to it from now on.'
      );
      loadUsage();
    } catch (err) {
      notify.error(errorDetail(err, 'Failed to create the usage sheet.'));
    } finally {
      setSheetConnecting(false);
    }
  };

  // --- Users ----------------------------------------------------------------

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params: Record<string, string | number> = {
        limit: USER_PAGE_SIZE,
        offset: userPage * USER_PAGE_SIZE,
      };
      if (userSearch) params.search = userSearch;
      const res = await axios.get<{
        users?: AdminUser[];
        total?: number;
        total_unfiltered?: number;
      }>(`${API_BASE_URL}/api/admin/users`, { params });
      setUsers(res.data.users || []);
      setUserTotal(res.data.total || 0);
      setUserTotalUnfiltered(res.data.total_unfiltered || 0);
    } catch (err) {
      notify.error(errorDetail(err, 'Failed to load users.'));
    } finally {
      setUsersLoading(false);
    }
  }, [userPage, userSearch]);

  // A new search is a different set of users — start at the first page of it.
  useEffect(() => {
    setUserPage((p) => (p === 0 ? p : 0));
  }, [userSearch]);

  // Users reload whenever their page or search changes.
  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // As an admin, /api/profiles returns every profile — the full menu to assign from.
  const loadAllProfiles = useCallback(async () => {
    try {
      const res = await axios.get<{ profiles?: string[] }>(`${API_BASE_URL}/api/profiles`);
      setAllProfiles(res.data.profiles || []);
    } catch (err) {
      notify.error(errorDetail(err, 'Failed to load candidate profiles.'));
    }
  }, []);

  // Usage and users are loaded by their own effects above — they re-run whenever their
  // inputs change, and firing them here too would just double the first request.
  useEffect(() => {
    loadKeys();
    loadSpend();
    loadAllProfiles();
  }, [loadKeys, loadSpend, loadAllProfiles]);

  const openAssign = (target: AdminUser) => {
    setEditingSub(target.sub);
    setDraftProfiles(target.assigned_profiles || []);
  };

  const toggleDraftProfile = (name: string) => {
    setDraftProfiles((current) =>
      current.includes(name) ? current.filter((n) => n !== name) : [...current, name]
    );
  };

  // Sends the complete list — an empty one revokes every profile from the user.
  const saveAssignment = async (target: AdminUser) => {
    setAssigningSub(target.sub);
    try {
      const res = await axios.put<{ message?: string }>(
        `${API_BASE_URL}/api/admin/users/${encodeURIComponent(target.sub)}/profiles`,
        { profiles: draftProfiles }
      );
      notify.success(res.data.message || 'Profiles assigned.');
      setEditingSub(null);
      loadUsers();
    } catch (err) {
      notify.error(errorDetail(err, 'Failed to assign profiles.'));
    } finally {
      setAssigningSub(null);
    }
  };

  const changeRole = async (target: AdminUser, role: Role) => {
    setSavingSub(target.sub);
    try {
      await axios.put(`${API_BASE_URL}/api/admin/users/${encodeURIComponent(target.sub)}/role`, {
        role,
      });
      notify.success(`${target.name || target.email} is now ${role === 'admin' ? 'an admin' : 'a user'}.`);
      setPendingRole(null);
      loadUsers();
    } catch (err) {
      notify.error(errorDetail(err, 'Failed to update role.'));
    } finally {
      setSavingSub(null);
    }
  };

  // --- Render ---------------------------------------------------------------

  const sheetMissing = usage !== null && !usage.connected;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin"
        description="OpenAI keys and spend, per-user generation usage, the backend request log, and who can do what. Only admins can see this page."
      />

      {/* --- OpenAI keys --- */}
      <Card>
        <CardHeader
          icon={KeyRound}
          title="OpenAI keys"
          description={
            <>
              The <strong>API key</strong> generates resumes and cover letters. The{' '}
              <strong>Admin key</strong> (<code className="font-mono text-xs">sk-admin-…</code>) is
              only used to read org spend below. Keys saved here override{' '}
              <code className="font-mono text-xs">backend/.env</code> and take effect on the next
              request — no restart. For security, existing keys are only ever shown masked.
            </>
          }
        />
        <CardBody>
          <form onSubmit={saveKeys} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <KeyField
                id="openai-api-key"
                label="OpenAI API key"
                placeholder="sk-…"
                value={apiKeyInput}
                onChange={setApiKeyInput}
                masked={keys?.openai_api_key}
                disabled={keysSaving}
                onClear={() => clearKey('openai_api_key', 'OpenAI API key')}
              />
              <KeyField
                id="openai-admin-key"
                label="OpenAI Admin key"
                placeholder="sk-admin-…"
                value={adminKeyInput}
                onChange={setAdminKeyInput}
                masked={keys?.openai_admin_key}
                disabled={keysSaving}
                onClear={() => clearKey('openai_admin_key', 'OpenAI Admin key')}
              />
            </div>
            <Button type="submit" variant="primary" loading={keysSaving} disabled={keysLoading}>
              Save keys
            </Button>
          </form>
        </CardBody>
      </Card>

      {/* --- OpenAI spend --- */}
      <Card>
        <CardHeader
          icon={CircleDollarSign}
          title="OpenAI API spend"
          description={
            <>
              OpenAI does not expose a remaining-balance figure via the API. This shows money{' '}
              <strong>spent</strong> (via the Costs API) and requires an Admin key.
            </>
          }
          actions={
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={loadSpend}
              loading={spendLoading}
            >
              Refresh
            </Button>
          }
        />
        <CardBody>
          {spend?.available ? (
            <StatGrid className="lg:grid-cols-2">
              <Stat
                label="Month to date"
                value={formatMoney(spend.month_to_date, spend.currency)}
                sub={`since ${formatEpoch(spend.month_start)}`}
              />
              <Stat label="Today" value={formatMoney(spend.today, spend.currency)} />
            </StatGrid>
          ) : spend ? (
            <Alert tone="info">{spend.error || 'OpenAI spend is unavailable.'}</Alert>
          ) : (
            <TableSkeleton rows={2} columns={2} />
          )}
        </CardBody>
      </Card>

      {/* --- Usage & governance --- */}
      <Card>
        <CardHeader
          icon={BarChart3}
          title="Usage & governance"
          description={
            <>
              Every generation is logged with the tokens it used and what they cost. Slice it by
              user, profile, source or model, over any date range, rolled up per day, week or month
              — and export exactly what you are looking at. Dates and totals are{' '}
              <strong>UTC</strong>, matching the log itself. Costs are <strong>estimated</strong>{' '}
              from the recorded token counts — OpenAI&apos;s Costs API above reports one org-wide
              total and cannot break spend down by user, so expect the two to be close but not
              identical.
            </>
          }
          actions={
            !sheetMissing ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={RefreshCw}
                  onClick={loadUsage}
                  loading={usageLoading}
                >
                  Refresh
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Download}
                  onClick={exportUsage}
                  loading={exporting}
                  disabled={!usage?.connected}
                >
                  Export CSV
                </Button>
                {usage?.sheet?.sheet_link && (
                  <Button variant="secondary" size="sm" asChild>
                    <a href={usage.sheet.sheet_link} target="_blank" rel="noreferrer">
                      <SheetIcon />
                      Open sheet
                      <ExternalLink />
                    </a>
                  </Button>
                )}
              </>
            ) : null
          }
        />

        <CardBody className="space-y-5">
          {sheetMissing ? (
            <>
              <Alert tone="info" title="No usage sheet yet">
                Create one in your Google Drive to start logging generations. You must have
                connected Drive first.
              </Alert>
              <Button
                variant="primary"
                icon={SheetIcon}
                onClick={connectSheet}
                loading={sheetConnecting}
              >
                Create usage sheet
              </Button>
            </>
          ) : (
            <>
              {(usage?.sheet?.pending_writes || usage?.generated_at) && (
                <p className="text-xs text-muted">
                  {usage?.generated_at && <>As of {formatTimestamp(usage.generated_at)}</>}
                  {usage?.sheet?.pending_writes ? (
                    <>
                      {' · '}
                      {usage.sheet.pending_writes} {plural(usage.sheet.pending_writes, 'row')} still
                      being written…
                    </>
                  ) : null}
                </p>
              )}

              {/* Filters — every one of them re-asks the server, so the figures below
                  always agree with each other. */}
              <div className="space-y-3 rounded-xl border border-border bg-surface-2/50 p-3.5">
                <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                  <div className="space-y-1.5">
                    <FilterLabel>Group by</FilterLabel>
                    <Segmented
                      size="sm"
                      aria-label="Group usage by"
                      options={GROUP_OPTIONS}
                      value={filters.group_by}
                      onChange={(value) => setFilter('group_by', value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FilterLabel>Quick range</FilterLabel>
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="secondary" size="sm" onClick={() => setRange(utcToday(), utcToday())}>
                        Today
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setRange(utcWeekStart(), '')}>
                        This week
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setRange(utcMonthStart(), '')}>
                        This month
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setRange(utcDaysAgo(29), '')}>
                        Last 30 days
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setRange('', '')}>
                        All time
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <FilterLabel>From</FilterLabel>
                    <Input
                      type="date"
                      className="w-[9.5rem]"
                      value={filters.date_from}
                      onChange={(e) => setFilter('date_from', e.target.value)}
                      aria-label="Usage from date"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FilterLabel>To</FilterLabel>
                    <Input
                      type="date"
                      className="w-[9.5rem]"
                      value={filters.date_to}
                      onChange={(e) => setFilter('date_to', e.target.value)}
                      aria-label="Usage to date"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <FilterLabel>User</FilterLabel>
                    <Select
                      className="w-48"
                      value={filters.user_sub}
                      onChange={(e) => setFilter('user_sub', e.target.value)}
                      aria-label="Filter by user"
                    >
                      <option value="">All users</option>
                      {(usage?.options?.users || []).map((option) => (
                        <option key={option.sub} value={option.sub}>
                          {option.name || option.email || option.sub}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <FilterLabel>Profile</FilterLabel>
                    <Select
                      className="w-44"
                      value={filters.profile}
                      onChange={(e) => setFilter('profile', e.target.value)}
                      aria-label="Filter by profile"
                    >
                      <option value="">All profiles</option>
                      {(usage?.options?.profiles || []).map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <FilterLabel>Source</FilterLabel>
                    <Select
                      className="w-36"
                      value={filters.action}
                      onChange={(e) => setFilter('action', e.target.value)}
                      aria-label="Filter by source"
                    >
                      <option value="">Any source</option>
                      {(usage?.options?.actions || []).map((action) => (
                        <option key={action} value={action}>
                          {sourceLabel(action)}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="min-w-[14rem] flex-1 space-y-1.5">
                    <FilterLabel>Search</FilterLabel>
                    <SearchInput
                      icon={<Search className="h-4 w-4" />}
                      placeholder="Company, role, email, model or URL"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      aria-label="Search usage"
                    />
                  </div>

                  {hasFilters && (
                    <Button variant="ghost" size="sm" icon={FilterX} onClick={clearFilters}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              {usage?.totals && (
                <>
                  <StatGrid className={rangeActive ? 'xl:grid-cols-5' : undefined}>
                    <Stat
                      label="Today"
                      value={formatNumber(usage.totals.today.generations)}
                      sub={tallySub(usage.totals.today)}
                    />
                    <Stat
                      label="This week"
                      value={formatNumber(usage.totals.week.generations)}
                      sub={tallySub(usage.totals.week)}
                      hint={usage.period_starts?.week ? `from ${usage.period_starts.week}` : undefined}
                    />
                    <Stat
                      label="This month"
                      value={formatNumber(usage.totals.month.generations)}
                      sub={tallySub(usage.totals.month)}
                      hint={usage.period_starts?.month ? `from ${usage.period_starts.month}` : undefined}
                    />
                    <Stat
                      label="All time"
                      value={formatNumber(usage.totals.all_time.generations)}
                      sub={tallySub(usage.totals.all_time)}
                    />
                    {rangeActive && (
                      <Stat
                        emphasis
                        label="Selected range"
                        value={formatNumber(usage.totals.range.generations)}
                        sub={tallySub(usage.totals.range)}
                        hint={`${filters.date_from || 'start'} → ${filters.date_to || 'today'}`}
                      />
                    )}
                  </StatGrid>
                  <p className="text-xs text-muted">
                    The first four tiles always report now, whatever range is selected; everything
                    below them is the filtered range.
                  </p>
                </>
              )}

              <Segmented
                aria-label="Usage view"
                options={USAGE_VIEWS}
                value={view}
                onChange={setView}
              />

              {!usage ? (
                <TableSkeleton rows={6} columns={6} />
              ) : (
                <div className="min-h-[8rem]">
                  {view === 'users' && (
                    <UsageUserTable
                      users={usage.users}
                      rangeActive={rangeActive}
                      activeSub={filters.user_sub}
                      onFocusUser={(sub) => setFilter('user_sub', sub)}
                    />
                  )}
                  {view === 'periods' && (
                    <UsagePeriodTable series={usage.series} groupBy={usage.group_by} />
                  )}
                  {view === 'matrix' && <UsageMatrix matrix={usage.matrix} groupBy={usage.group_by} />}
                  {view === 'breakdown' && (
                    <div className="grid gap-4 lg:grid-cols-3">
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
                  {view === 'log' && (
                    <UsageLog rows={usage.rows} page={logPage} onPage={setLogPage} />
                  )}
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {/* --- Backend logs --- */}
      <LogsPanel />

      {/* --- Users / roles --- */}
      <Card>
        <CardHeader
          icon={UserCog}
          title="Users & roles"
          description="Admins can do everything and see this page, including using every candidate profile. Users can generate resumes, but only with the profiles you assign them here — a user with none assigned sees an empty picker telling them to ask an administrator."
          actions={
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={loadUsers}
              loading={usersLoading}
            >
              Refresh
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Searches every user, not the page on screen. */}
            <SearchInput
              className="w-full sm:w-72"
              icon={<Search className="h-4 w-4" />}
              placeholder="Search name or email"
              value={userSearchInput}
              onChange={(e) => setUserSearchInput(e.target.value)}
              aria-label="Search users"
            />
            {userSearchInput && (
              <Button variant="ghost" size="sm" icon={FilterX} onClick={() => setUserSearchInput('')}>
                Clear
              </Button>
            )}
            <Badge tone="neutral" className="ml-auto">
              {formatNumber(userTotal)} {plural(userTotal, 'user')}
            </Badge>
          </div>

          {usersLoading && users.length === 0 ? (
            <TableSkeleton rows={5} columns={5} />
          ) : users.length === 0 ? (
            <EmptyState
              icon={Users}
              title={userTotalUnfiltered === 0 ? 'No users yet' : 'No users match that search'}
              description={
                userTotalUnfiltered === 0
                  ? 'Users appear here the first time they sign in with Google.'
                  : `${formatNumber(userTotalUnfiltered)} ${plural(userTotalUnfiltered, 'user')} exist in total.`
              }
            />
          ) : (
            <TableWrap dimmed={usersLoading}>
              <Table>
                <THead>
                  <tr>
                    <TH className="pl-4">User</TH>
                    <TH>Email</TH>
                    <TH>Role</TH>
                    <TH>Assigned profiles</TH>
                    <TH>Last login</TH>
                    <TH className="text-right">Action</TH>
                  </tr>
                </THead>
                <TBody>
                  {users.map((target) => {
                    const isSelf = target.sub === user?.sub;
                    const locked = !!target.is_env_admin;
                    const isAdminUser = target.role === 'admin';
                    const assigned = target.assigned_profiles || [];
                    const editing = editingSub === target.sub;
                    return (
                      <React.Fragment key={target.sub}>
                        <TR selected={editing}>
                          <TD className="pl-4 font-medium">
                            <span className="inline-flex items-center gap-2">
                              {target.name || '—'}
                              {isSelf && <Badge tone="info">you</Badge>}
                            </span>
                          </TD>
                          <TD className="text-muted">{target.email}</TD>
                          <TD>
                            <span className="inline-flex items-center gap-1.5">
                              <Badge tone={isAdminUser ? 'brand' : 'neutral'}>
                                {isAdminUser ? <ShieldCheck className="h-3 w-3" /> : null}
                                {target.role}
                              </Badge>
                              {locked && (
                                <Tooltip content="Set by ADMIN_EMAILS in the environment — cannot be changed here">
                                  <span className="text-2xs text-subtle">via env</span>
                                </Tooltip>
                              )}
                            </span>
                          </TD>
                          <TD className="max-w-[18rem]">
                            {isAdminUser ? (
                              <span className="text-xs text-muted">All (admin)</span>
                            ) : (
                              <div className="flex flex-wrap items-center gap-1.5">
                                {assigned.length > 0 ? (
                                  assigned.map((name) => (
                                    <Badge key={name} tone="neutral">
                                      {name}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-xs text-subtle">None assigned</span>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => (editing ? setEditingSub(null) : openAssign(target))}
                                >
                                  {editing ? 'Cancel' : 'Assign'}
                                </Button>
                              </div>
                            )}
                          </TD>
                          <TD className="whitespace-nowrap text-muted">
                            {formatEpoch(target.last_login_at)}
                          </TD>
                          <TD className="text-right">
                            {isSelf ? (
                              <span className="text-xs text-subtle">—</span>
                            ) : locked ? (
                              <span className="text-xs text-subtle">Locked</span>
                            ) : (
                              <Button
                                variant={isAdminUser ? 'secondary' : 'primary'}
                                size="sm"
                                icon={Shield}
                                loading={savingSub === target.sub}
                                onClick={() =>
                                  setPendingRole({ target, role: isAdminUser ? 'user' : 'admin' })
                                }
                              >
                                {isAdminUser ? 'Demote' : 'Make admin'}
                              </Button>
                            )}
                          </TD>
                        </TR>

                        {editing && (
                          <tr className="bg-surface-2/60">
                            <td colSpan={6} className="px-4 py-4">
                              {allProfiles.length === 0 ? (
                                <p className="text-sm text-muted">
                                  No candidate profiles exist yet. Create one on the Profiles page
                                  first.
                                </p>
                              ) : (
                                <div className="space-y-3">
                                  <p className="text-xs text-muted">
                                    Tick the profiles {target.name || target.email} may generate
                                    with. Unticking everything revokes their access.
                                  </p>
                                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {allProfiles.map((name) => (
                                      <CheckboxField
                                        key={name}
                                        checked={draftProfiles.includes(name)}
                                        onCheckedChange={() => toggleDraftProfile(name)}
                                      >
                                        {name}
                                      </CheckboxField>
                                    ))}
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      variant="primary"
                                      size="sm"
                                      onClick={() => saveAssignment(target)}
                                      loading={assigningSub === target.sub}
                                    >
                                      Save assignment
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => setEditingSub(null)}
                                      disabled={assigningSub === target.sub}
                                    >
                                      Cancel
                                    </Button>
                                    {draftProfiles.length > 0 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        icon={Trash2}
                                        onClick={() => setDraftProfiles([])}
                                        disabled={assigningSub === target.sub}
                                      >
                                        Revoke all
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TBody>
              </Table>
            </TableWrap>
          )}

          {userTotal > USER_PAGE_SIZE && (
            <SimplePager
              onPrevious={() => setUserPage((p) => Math.max(0, p - 1))}
              onNext={() => setUserPage((p) => p + 1)}
              previousDisabled={userPage === 0 || usersLoading}
              nextDisabled={(userPage + 1) * USER_PAGE_SIZE >= userTotal || usersLoading}
              summary={`Page ${userPage + 1} of ${Math.ceil(userTotal / USER_PAGE_SIZE)} · ${formatNumber(userTotal)} ${plural(userTotal, 'user')}`}
            />
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={pendingRole !== null}
        onOpenChange={(open) => !open && setPendingRole(null)}
        title={
          pendingRole?.role === 'admin'
            ? `Make ${pendingRole.target.name || pendingRole?.target.email} an admin?`
            : `Demote ${pendingRole?.target.name || pendingRole?.target.email} to user?`
        }
        description={
          pendingRole?.role === 'admin'
            ? 'Admins can use every candidate profile, read the backend logs, change OpenAI keys and change other people’s roles — including yours.'
            : 'They will keep only the candidate profiles explicitly assigned to them, and lose access to this page.'
        }
        confirmLabel={pendingRole?.role === 'admin' ? 'Make admin' : 'Demote'}
        destructive={pendingRole?.role !== 'admin'}
        loading={savingSub === pendingRole?.target.sub}
        onConfirm={() => pendingRole && changeRole(pendingRole.target, pendingRole.role)}
      />
    </div>
  );
}

/**
 * One masked-key input.
 *
 * The current value is never sent to the browser in full, so the field shows what is
 * set and where it came from, and stays empty: typing into it replaces the key, and
 * leaving it alone keeps whatever is there.
 */
function KeyField({
  id,
  label,
  placeholder,
  value,
  onChange,
  masked,
  disabled,
  onClear,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  masked?: OpenAIKeys['openai_api_key'];
  disabled?: boolean;
  onClear: () => void;
}) {
  return (
    <Field
      label={
        <span className="flex flex-wrap items-center gap-2">
          {label}
          {masked?.is_set ? (
            <Badge tone={masked.source === 'env' ? 'neutral' : 'brand'}>
              <code className="font-mono">{masked.masked}</code>
              {masked.source === 'env' ? ' from .env' : ' set here'}
            </Badge>
          ) : (
            <Badge tone="warning">not set</Badge>
          )}
        </span>
      }
      htmlFor={id}
    >
      <div className="flex gap-2">
        <Input
          id={id}
          type="password"
          placeholder={masked?.is_set ? 'Enter a new key to replace it' : placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          disabled={disabled}
        />
        {masked?.source === 'settings' && (
          <Tooltip content="Remove the override and fall back to backend/.env">
            <Button variant="secondary" onClick={onClear} disabled={disabled}>
              Clear
            </Button>
          </Tooltip>
        )}
      </div>
    </Field>
  );
}
