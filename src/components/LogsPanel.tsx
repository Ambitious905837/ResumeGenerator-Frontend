import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  ChevronDown,
  ChevronRight,
  Download,
  FilterX,
  RefreshCw,
  ScrollText,
  Search,
  Route as RouteIcon,
  X,
} from 'lucide-react';
import { API_BASE_URL } from '../auth';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { errorDetail, saveBlob } from '../lib/download';
import { formatBytes, formatLogTime, formatNumber, plural } from '../lib/format';
import { cn } from '../lib/cn';
import type { LogEntry, LogLevel, LogsResponse } from '../types/api';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardBody, CardHeader } from './ui/card';
import { FilterLabel, Input, SearchInput, Select } from './ui/field';
import { EmptyState, TableSkeleton } from './ui/feedback';
import { SimplePager } from './ui/pagination';
import { Table, TableWrap, TBody, TD, TH, THead } from './ui/table';
import { Tooltip } from './ui/tooltip';

// The server holds the whole log; this only ever asks for a page of it. 100 rows is
// about a screenful of scrolling and keeps the response small enough to poll.
const PAGE_SIZE = 100;

const LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARNING', 'ERROR'];

interface Filters {
  level: string;
  event: string;
  request_id: string;
  user_query: string;
  endpoint: string;
  search: string;
}

const EMPTY: Filters = {
  level: 'INFO',
  event: '',
  request_id: '',
  user_query: '',
  endpoint: '',
  search: '',
};

// Filters worth one click, because they are the questions actually asked of this log.
// "Missing files" is the reason the panel exists: it collects every line that reports a
// document which was generated but did not end up where it belongs.
const PRESETS: Array<{ key: string; label: string; hint: string; filters: Partial<Filters> }> = [
  {
    key: 'problems',
    label: 'Problems only',
    hint: 'Warnings and errors',
    filters: { level: 'WARNING', event: '', search: '' },
  },
  {
    key: 'missing',
    label: 'Missing files',
    hint: 'Generations that produced fewer documents than they should have',
    filters: { level: 'WARNING', event: '', search: 'missing' },
  },
  {
    key: 'drive',
    label: 'Drive uploads',
    hint: 'Every upload, retry and conversion',
    filters: { level: 'DEBUG', event: 'drive.', search: '' },
  },
  {
    key: 'generation',
    label: 'Generations',
    hint: 'Start and outcome of each generation',
    filters: { level: 'DEBUG', event: 'generation.', search: '' },
  },
  {
    key: 'slow',
    label: 'Retries',
    hint: 'Uploads that had to be retried',
    filters: { level: 'DEBUG', event: 'drive.attempt', search: '' },
  },
];

// Fields rendered as their own chip next to the message. Everything else stays in the
// expanded JSON — a log line can carry a dozen fields and only a few earn screen space.
const CHIP_FIELDS = ['status', 'duration_ms', 'file', 'folder', 'profile', 'company', 'attempt'];

type LevelTone = 'danger' | 'warning' | 'neutral' | 'info';

function levelTone(level?: string): LevelTone {
  const l = (level || '').toUpperCase();
  if (l === 'ERROR' || l === 'CRITICAL') return 'danger';
  if (l === 'WARNING') return 'warning';
  if (l === 'DEBUG') return 'neutral';
  return 'info';
}

/** The handful of context fields worth showing inline, as small chips. */
function chipsFor(entry: LogEntry): Array<[string, string]> {
  return CHIP_FIELDS.filter(
    (f) => entry[f] !== undefined && entry[f] !== null && entry[f] !== ''
  ).map((f) => [f, f === 'duration_ms' ? `${entry[f]} ms` : String(entry[f])]);
}

function LogRow({
  entry,
  expanded,
  onToggle,
  onTrace,
}: {
  entry: LogEntry;
  expanded: boolean;
  onToggle: () => void;
  onTrace: (requestId: string) => void;
}) {
  const chips = chipsFor(entry);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <>
      <tr
        className={cn(
          'cursor-pointer border-t border-border transition-colors hover:bg-surface-2/70',
          expanded && 'bg-surface-2'
        )}
        onClick={onToggle}
      >
        <TD className="w-8 pl-3 text-subtle">
          <Chevron className="h-3.5 w-3.5" aria-hidden="true" />
        </TD>
        <TD className="whitespace-nowrap font-mono text-xs text-muted">{formatLogTime(entry.ts)}</TD>
        <TD>
          <Badge tone={levelTone(entry.level)}>{entry.level}</Badge>
        </TD>
        <TD className="whitespace-nowrap font-mono text-xs text-fg">{entry.event}</TD>
        <TD>
          <span className="text-sm text-fg">{entry.msg}</span>
          {chips.length > 0 && (
            <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
              {chips.map(([key, value]) => (
                <span
                  key={key}
                  className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-muted"
                >
                  {key}: {value}
                </span>
              ))}
            </span>
          )}
        </TD>
        <TD className="text-right">
          {entry.request_id ? (
            <Tooltip content="Show every line this request produced, in order">
              <Button
                variant="ghost"
                size="sm"
                icon={RouteIcon}
                onClick={(e) => {
                  e.stopPropagation();
                  onTrace(entry.request_id as string);
                }}
              >
                Trace
              </Button>
            </Tooltip>
          ) : (
            <span className="text-xs text-subtle">—</span>
          )}
        </TD>
      </tr>
      {expanded && (
        <tr className="bg-surface-2">
          <td colSpan={6} className="px-3 pb-3">
            <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-bg p-3 font-mono text-xs leading-relaxed text-muted">
              {JSON.stringify(entry, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

/** The ordered timeline of one request — the view that explains a half-finished job. */
function TraceView({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setEntries(null);
    setError('');
    axios
      .get<{ entries?: LogEntry[] }>(
        `${API_BASE_URL}/api/admin/logs/request/${encodeURIComponent(requestId)}`
      )
      .then((res) => {
        if (alive) setEntries(res.data.entries || []);
      })
      .catch((err) => {
        if (alive) setError(errorDetail(err, 'Could not load the trace.'));
      });
    return () => {
      alive = false;
    };
  }, [requestId]);

  const first = entries && entries[0];

  return (
    <div className="rounded-xl border border-brand/30 bg-brand-soft/40 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium text-fg">Request {requestId}</p>
          {first && (
            <p className="mt-0.5 text-xs text-muted">
              {first.endpoint || 'unknown endpoint'}
              {first.user_email ? ` · ${first.user_email}` : ''}
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" icon={X} onClick={onClose}>
          Close
        </Button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {!entries && !error && <TableSkeleton rows={3} columns={2} />}
      {entries && entries.length === 0 && (
        <p className="text-sm text-muted">
          Nothing left for this request — its lines have already rotated out of the log.
        </p>
      )}

      {entries && entries.length > 0 && (
        <ol className="space-y-0">
          {entries.map((entry, index) => {
            const tone = levelTone(entry.level);
            return (
              <li key={index} className="relative flex gap-3 pb-4 last:pb-0">
                {/* The rule joining the dots, stopped short on the final step. */}
                {index < entries.length - 1 && (
                  <span
                    className="absolute left-[5px] top-4 h-full w-px bg-border"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={cn(
                    'relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-surface',
                    tone === 'danger'
                      ? 'bg-danger'
                      : tone === 'warning'
                        ? 'bg-warning'
                        : tone === 'neutral'
                          ? 'bg-subtle'
                          : 'bg-info'
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-xs font-medium text-fg">{entry.event}</code>
                    <span className="text-2xs text-subtle">{formatLogTime(entry.ts)}</span>
                    {entry.duration_ms !== undefined && (
                      <Badge tone="neutral">{entry.duration_ms} ms</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{entry.msg}</p>
                  {entry.error ? (
                    <p className="mt-1 rounded-md bg-danger-soft px-2 py-1 font-mono text-xs text-danger-fg">
                      {entry.error}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/**
 * The backend's structured request log.
 *
 * Collapsed by default and only fetched once opened: an admin arriving for the usage
 * figures should not pay for a log query, and the auto-refresh below would otherwise
 * keep an idle tab polling a multi-megabyte file forever.
 */
export function LogsPanel() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [draftSearch, setDraftSearch] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [open, setOpen] = useState(false);

  // The search box is debounced into `filters` so typing doesn't fire a request per
  // keystroke against a log file that may be tens of megabytes.
  const debouncedSearch = useDebouncedValue(draftSearch, 400);
  useEffect(() => {
    setFilters((f) => (f.search === debouncedSearch ? f : { ...f, search: debouncedSearch }));
  }, [debouncedSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get<LogsResponse>(`${API_BASE_URL}/api/admin/logs`, {
        params: { ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      });
      setData(res.data);
    } catch (err) {
      setError(errorDetail(err, 'Could not load the logs.'));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Polling is opt-in and stops when the panel is closed, so an idle admin tab does
  // not sit there querying the log file every few seconds forever.
  const savedLoad = useRef(load);
  useEffect(() => {
    savedLoad.current = load;
  }, [load]);
  useEffect(() => {
    if (!open || !autoRefresh) return undefined;
    const id = setInterval(() => savedLoad.current(), 5000);
    return () => clearInterval(id);
  }, [open, autoRefresh]);

  const setFilter = (key: keyof Filters, value: string) => {
    setPage(0);
    setExpanded(null);
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
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
      const res = await axios.get(`${API_BASE_URL}/api/admin/logs/download`, {
        responseType: 'blob',
      });
      saveBlob(res.data, 'app.jsonl', 'application/x-ndjson');
    } catch {
      setError('Could not download the log file.');
    }
  };

  const entries = data?.entries || [];
  const total = data?.total_matched || 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const dirty = useMemo(
    () => JSON.stringify(filters) !== JSON.stringify(EMPTY) || !!draftSearch,
    [filters, draftSearch]
  );

  return (
    <Card>
      <CardHeader
        icon={ScrollText}
        title="Backend logs"
        description={
          <>
            Every request the backend handles writes a structured trace here: the scrape, the model
            call, the documents it built, and each individual Drive upload with its retries. When a
            job comes back with a resume but no job description or PDF, <strong>Trace</strong> on any
            of its lines shows the step that failed and the reason Google gave for it.
          </>
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={open ? ChevronDown : ChevronRight}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            {open ? 'Hide logs' : 'Show logs'}
          </Button>
        }
      />

      {open && (
        <CardBody className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Tooltip key={preset.key} content={preset.hint}>
                <Button variant="secondary" size="sm" onClick={() => applyPreset(preset)}>
                  {preset.label}
                </Button>
              </Tooltip>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-2/50 p-3">
            <div className="space-y-1.5">
              <FilterLabel>Level</FilterLabel>
              <Select
                className="w-40"
                value={filters.level}
                onChange={(e) => setFilter('level', e.target.value)}
                aria-label="Minimum log level"
              >
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level} and above
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <FilterLabel>Event</FilterLabel>
              <Input
                type="search"
                className="w-44"
                placeholder="drive.upload, generation…"
                value={filters.event}
                onChange={(e) => setFilter('event', e.target.value)}
                aria-label="Event name"
              />
            </div>

            <div className="space-y-1.5">
              <FilterLabel>Request id</FilterLabel>
              <Input
                type="search"
                className="w-40"
                placeholder="exact id"
                value={filters.request_id}
                onChange={(e) => setFilter('request_id', e.target.value)}
                aria-label="Request id"
              />
            </div>

            <div className="space-y-1.5">
              <FilterLabel>User</FilterLabel>
              <Input
                type="search"
                className="w-44"
                placeholder="email or sub"
                value={filters.user_query}
                onChange={(e) => setFilter('user_query', e.target.value)}
                aria-label="User email or subject"
              />
            </div>

            <div className="min-w-[16rem] flex-1 space-y-1.5">
              <FilterLabel>Search</FilterLabel>
              <SearchInput
                icon={<Search className="h-4 w-4" />}
                placeholder="Any text in the line — a company, a filename, a Google error"
                value={draftSearch}
                onChange={(e) => setDraftSearch(e.target.value)}
                aria-label="Search log lines"
              />
            </div>

            {dirty && (
              <Button variant="ghost" size="sm" icon={FilterX} onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted">
              {loading
                ? 'Loading…'
                : `${formatNumber(total)}${data?.truncated ? '+' : ''} matching ${plural(total, 'line')}`}
              {data?.stats &&
                ` · ${data.stats.files} ${plural(data.stats.files, 'file')}, ${formatBytes(
                  data.stats.bytes
                )} on disk · level ${data.stats.level}`}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[hsl(var(--brand))]"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                Auto-refresh
              </label>
              <Button variant="secondary" size="sm" icon={RefreshCw} onClick={load} loading={loading}>
                Refresh
              </Button>
              <Button variant="secondary" size="sm" icon={Download} onClick={download}>
                Download raw
              </Button>
            </div>
          </div>

          {traceId && <TraceView requestId={traceId} onClose={() => setTraceId(null)} />}

          {loading && entries.length === 0 ? (
            <TableSkeleton rows={8} columns={5} />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="Nothing matches these filters yet"
              description="Try a lower level, or clear the filters to see the most recent lines."
              action={
                dirty ? (
                  <Button variant="secondary" size="sm" icon={FilterX} onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TableWrap dimmed={loading} maxHeight="40rem">
              <Table>
                <THead>
                  <tr>
                    <TH className="w-8 pl-3" />
                    <TH>Time</TH>
                    <TH>Level</TH>
                    <TH>Event</TH>
                    <TH>Message</TH>
                    <TH className="text-right">Trace</TH>
                  </tr>
                </THead>
                <TBody className="divide-y-0">
                  {entries.map((entry, index) => {
                    const id = `${entry.ts}-${index}`;
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
                </TBody>
              </Table>
            </TableWrap>
          )}

          {total > PAGE_SIZE && (
            <SimplePager
              onPrevious={() => setPage((p) => Math.max(0, p - 1))}
              onNext={() => setPage((p) => p + 1)}
              previousDisabled={page === 0 || loading}
              nextDisabled={page >= lastPage || loading}
              previousLabel="Newer"
              nextLabel="Older"
              summary={`Page ${page + 1} of ${lastPage + 1}`}
            />
          )}
        </CardBody>
      )}
    </Card>
  );
}

export default LogsPanel;
