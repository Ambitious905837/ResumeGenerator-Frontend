import React from 'react';
import { ExternalLink, Focus, X } from 'lucide-react';
import { formatCompact, formatMoney, formatNumber, formatTimestamp, plural } from '../../lib/format';
import type {
  UsageBreakdownRow,
  UsageLogRow,
  UsageMatrixData,
  UsagePeriod,
  UsageUser,
} from '../../types/api';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/feedback';
import { SimplePager } from '../ui/pagination';
import { CellSub, Table, TableWrap, TBody, TD, TH, THead, TR } from '../ui/table';
import { Tooltip } from '../ui/tooltip';

/** "Job link" and "JD file" read better than the raw enum the sheet stores. */
export function sourceLabel(action?: string): string {
  if (action === 'job_url') return 'Job link';
  if (action === 'job_description') return 'JD file';
  return action || '—';
}

function NothingHere({ filtered }: { filtered?: boolean }) {
  return (
    <EmptyState
      title={filtered ? 'No generations match these filters' : 'Nothing generated in this range'}
      description="Widen the date range, or clear the filters above."
    />
  );
}

/** Per-user totals across the fixed windows, plus the active date range. */
export function UsageUserTable({
  users,
  rangeActive,
  activeSub,
  onFocusUser,
}: {
  users?: UsageUser[];
  rangeActive: boolean;
  activeSub: string;
  onFocusUser: (sub: string) => void;
}) {
  if (!users?.length) return <NothingHere filtered />;
  return (
    <TableWrap maxHeight="34rem">
      <Table>
        <THead>
          <tr>
            <TH className="pl-4">User</TH>
            <TH>Email</TH>
            <TH className="text-right">Today</TH>
            <TH className="text-right">Week</TH>
            <TH className="text-right">Month</TH>
            <TH className="text-right">Last 30d</TH>
            {rangeActive && <TH className="text-right">In range</TH>}
            <TH className="text-right">All time</TH>
            <TH className="text-right">Tokens</TH>
            <TH className="text-right">Est. cost</TH>
            <TH>Last generated</TH>
            <TH />
          </tr>
        </THead>
        <TBody>
          {users.map((user) => {
            const focused = activeSub === user.sub;
            return (
              <TR key={user.sub} selected={focused}>
                <TD className="pl-4 font-medium">
                  {user.name || '—'}
                  {user.profiles && user.profiles.length > 0 && (
                    <CellSub>{user.profiles.join(', ')}</CellSub>
                  )}
                </TD>
                <TD className="text-muted">{user.email || '—'}</TD>
                <TD className="text-right tabular-nums">{formatNumber(user.today.generations)}</TD>
                <TD className="text-right tabular-nums">{formatNumber(user.week.generations)}</TD>
                <TD className="text-right tabular-nums">{formatNumber(user.month.generations)}</TD>
                <TD className="text-right tabular-nums">{formatNumber(user.last_30.generations)}</TD>
                {rangeActive && (
                  <TD className="text-right font-medium tabular-nums">
                    {formatNumber(user.range.generations)}
                  </TD>
                )}
                <TD className="text-right tabular-nums">{formatNumber(user.total.generations)}</TD>
                <TD className="text-right tabular-nums text-muted">
                  {formatCompact(user.total.total_tokens)}
                </TD>
                <TD className="text-right tabular-nums">{formatMoney(user.total.cost_usd)}</TD>
                <TD className="whitespace-nowrap text-muted">{formatTimestamp(user.last_used_at)}</TD>
                <TD className="text-right">
                  <Tooltip
                    content={focused ? 'Stop filtering by this user' : 'Filter everything below to this user'}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={focused ? X : Focus}
                      onClick={() => onFocusUser(focused ? '' : user.sub)}
                    >
                      {focused ? 'Clear' : 'Drill in'}
                    </Button>
                  </Tooltip>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </TableWrap>
  );
}

/** Totals per calendar period, newest first. */
export function UsagePeriodTable({
  series,
  groupBy,
}: {
  series?: UsagePeriod[];
  groupBy?: 'day' | 'week' | 'month';
}) {
  if (!series?.length) return <NothingHere />;
  const heading = groupBy === 'month' ? 'Month' : groupBy === 'week' ? 'Week' : 'Day';
  const peak = Math.max(...series.map((s) => s.generations), 1);
  return (
    <TableWrap maxHeight="34rem">
      <Table>
        <THead>
          <tr>
            <TH className="pl-4">{heading}</TH>
            <TH>Generations</TH>
            <TH className="text-right">Users</TH>
            <TH className="text-right">Tokens</TH>
            <TH className="text-right">Est. cost</TH>
          </tr>
        </THead>
        <TBody>
          {[...series].reverse().map((row) => (
            <TR key={row.period}>
              <TD className="pl-4 font-medium">
                {row.label}
                <CellSub>{row.period}</CellSub>
              </TD>
              <TD>
                {/* An inline bar makes the shape of the series readable without a chart:
                    which day was busy is otherwise a column of numbers to compare by eye. */}
                <div className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-right tabular-nums">
                    {formatNumber(row.generations)}
                  </span>
                  <span className="h-1.5 w-full max-w-[10rem] overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full bg-brand"
                      style={{ width: `${Math.round((row.generations / peak) * 100)}%` }}
                    />
                  </span>
                </div>
              </TD>
              <TD className="text-right tabular-nums text-muted">{formatNumber(row.users)}</TD>
              <TD className="text-right tabular-nums text-muted">{formatCompact(row.total_tokens)}</TD>
              <TD className="text-right tabular-nums">{formatMoney(row.cost_usd)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  );
}

/** Who generated how many, per period — the grid the daily/weekly question really asks. */
export function UsageMatrix({
  matrix,
  groupBy,
}: {
  matrix?: UsageMatrixData;
  groupBy?: 'day' | 'week' | 'month';
}) {
  const periods = [...(matrix?.periods || [])].reverse();
  if (!periods.length || !matrix?.rows?.length) return <NothingHere />;

  const columnTotal = (period: string) =>
    matrix.rows.reduce((sum, row) => sum + (row.cells[period]?.generations || 0), 0);
  const busiest = Math.max(
    1,
    ...matrix.rows.flatMap((row) => periods.map((p) => row.cells[p.period]?.generations || 0))
  );

  return (
    <div className="space-y-2">
      {matrix.truncated && (
        <p className="text-xs text-muted">
          Showing the most recent {periods.length} of {matrix.total_periods} {groupBy}s — narrow the
          date range to see earlier ones.
        </p>
      )}
      <TableWrap maxHeight="34rem">
        <Table>
          <THead>
            <tr>
              {/* The name column is pinned: at twenty date columns the row you are
                  reading scrolls out from under its own label otherwise. */}
              <TH className="sticky left-0 z-20 bg-surface-2 pl-4">User</TH>
              {periods.map((period) => (
                <TH key={period.period} className="text-right" title={period.label}>
                  {groupBy === 'day' ? period.period.slice(5) : period.period}
                </TH>
              ))}
              <TH className="text-right">Total</TH>
            </tr>
          </THead>
          <TBody>
            {matrix.rows.map((row) => (
              <TR key={row.sub}>
                <TD className="sticky left-0 z-10 bg-surface pl-4 font-medium">
                  {row.name || row.email || row.sub}
                  {row.email && <CellSub>{row.email}</CellSub>}
                </TD>
                {periods.map((period) => {
                  const cell = row.cells[period.period];
                  const intensity = cell ? Math.max(0.12, cell.generations / busiest) : 0;
                  return (
                    <TD key={period.period} className="p-1 text-right">
                      {cell ? (
                        // A heat cell rather than a bare number: the busy user/day pairs
                        // are the point of this view and should be findable at a glance.
                        <span
                          className="block rounded px-2 py-1 text-right tabular-nums text-fg"
                          style={{ backgroundColor: `hsl(var(--brand) / ${intensity * 0.5})` }}
                          title={`${formatMoney(cell.cost_usd)} · ${formatNumber(cell.total_tokens)} tokens`}
                        >
                          {formatNumber(cell.generations)}
                        </span>
                      ) : (
                        <span className="block px-2 py-1 text-subtle">·</span>
                      )}
                    </TD>
                  );
                })}
                <TD className="text-right font-semibold tabular-nums">
                  {formatNumber(row.total.generations)}
                </TD>
              </TR>
            ))}
            <TR className="bg-surface-2/60 font-semibold">
              <TD className="sticky left-0 z-10 bg-surface-2 pl-4">All users</TD>
              {periods.map((period) => (
                <TD key={period.period} className="text-right tabular-nums">
                  {formatNumber(columnTotal(period.period))}
                </TD>
              ))}
              <TD className="text-right tabular-nums">
                {formatNumber(matrix.rows.reduce((sum, r) => sum + r.total.generations, 0))}
              </TD>
            </TR>
          </TBody>
        </Table>
      </TableWrap>
    </div>
  );
}

/** A simple "group by one column" table: profile, action or model. */
export function UsageBreakdown({
  title,
  field,
  rows,
  onSelect,
}: {
  title: string;
  field: 'profile' | 'action' | 'model';
  rows?: UsageBreakdownRow[];
  onSelect?: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-subtle">{title}</h4>
      {rows?.length ? (
        <TableWrap maxHeight="22rem">
          <Table>
            <THead>
              <tr>
                <TH className="pl-4">{title}</TH>
                <TH className="text-right">Gen.</TH>
                <TH className="text-right">Users</TH>
                <TH className="text-right">Est. cost</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => {
                const value = row[field];
                return (
                  <TR key={value || '—'}>
                    <TD className="pl-4">
                      {onSelect && value && value !== '—' ? (
                        <button
                          type="button"
                          className="text-brand hover:underline"
                          onClick={() => onSelect(value)}
                        >
                          {field === 'action' ? sourceLabel(value) : value}
                        </button>
                      ) : (
                        <span>{field === 'action' ? sourceLabel(value) : value || '—'}</span>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">{formatNumber(row.generations)}</TD>
                    <TD className="text-right tabular-nums text-muted">{formatNumber(row.users)}</TD>
                    <TD className="text-right tabular-nums">{formatMoney(row.cost_usd)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          Nothing in this range.
        </p>
      )}
    </div>
  );
}

/** The raw log: one row per generation, exactly as recorded. */
export function UsageLog({
  rows,
  page,
  onPage,
}: {
  rows?: { items: UsageLogRow[]; total: number; offset: number };
  page: number;
  onPage: (page: number) => void;
}) {
  const items = rows?.items || [];
  const total = rows?.total || 0;
  const offset = rows?.offset || 0;
  const first = total === 0 ? 0 : offset + 1;
  const last = offset + items.length;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <NothingHere filtered />
      ) : (
        <TableWrap maxHeight="34rem">
          <Table>
            <THead>
              <tr>
                <TH className="pl-4">When (UTC)</TH>
                <TH>User</TH>
                <TH>Profile</TH>
                <TH>Source</TH>
                <TH>Company</TH>
                <TH>Role</TH>
                <TH>Model</TH>
                <TH className="text-right">Tokens</TH>
                <TH className="text-right">Est. cost</TH>
              </tr>
            </THead>
            <TBody>
              {items.map((row, index) => (
                <TR key={`${row.timestamp_utc}-${row.sub}-${index}`}>
                  <TD className="whitespace-nowrap pl-4 text-muted">
                    {formatTimestamp(row.timestamp_utc)}
                  </TD>
                  <TD>
                    <span className="font-medium">{row.name || '—'}</span>
                    {row.email && <CellSub>{row.email}</CellSub>}
                  </TD>
                  <TD>{row.profile || '—'}</TD>
                  <TD className="text-muted">{sourceLabel(row.action)}</TD>
                  <TD className="max-w-[14rem]">
                    {row.url ? (
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 truncate text-brand hover:underline"
                        title={row.url}
                      >
                        <span className="truncate">{row.company || '—'}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                      </a>
                    ) : (
                      row.company || '—'
                    )}
                  </TD>
                  <TD className="max-w-[14rem]">
                    <span className="block truncate" title={row.role}>
                      {row.role || '—'}
                    </span>
                  </TD>
                  <TD className="font-mono text-xs text-muted">{row.model || '—'}</TD>
                  <TD className="text-right tabular-nums">{formatNumber(row.total_tokens)}</TD>
                  <TD className="text-right tabular-nums">{formatMoney(row.cost_usd)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
      <SimplePager
        onPrevious={() => onPage(page - 1)}
        onNext={() => onPage(page + 1)}
        previousDisabled={page === 0}
        nextDisabled={last >= total}
        summary={
          total === 0
            ? 'No rows'
            : `${formatNumber(first)}–${formatNumber(last)} of ${formatNumber(total)} ${plural(total, 'generation')}`
        }
      />
    </div>
  );
}
