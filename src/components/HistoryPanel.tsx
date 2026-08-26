import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  CalendarDays,
  Download,
  ExternalLink,
  FileStack,
  FilterX,
  Inbox,
  RefreshCw,
  Search,
  SearchX,
} from 'lucide-react';
import { API_BASE_URL } from '../auth';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { blobErrorDetail, errorDetail, saveBlob } from '../lib/download';
import { formatNumber, plural } from '../lib/format';
import { notify } from '../lib/notify';
import { cn } from '../lib/cn';
import type { HistoryDriveLinkResponse, HistoryResponse, HistoryRow } from '../types/api';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardBody, CardFooter, CardHeader } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { FilterLabel, Input, SearchInput } from './ui/field';
import { EmptyState, TableSkeleton } from './ui/feedback';
import { Pagination } from './ui/pagination';
import { Spinner } from './ui/spinner';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from './ui/table';
import { HintWrap, Tooltip } from './ui/tooltip';

const PAGE_SIZE = 10;

const EMPTY_HISTORY: HistoryResponse = {
  file_path: '',
  history: [],
  count: 0,
  total: 0,
  downloadable: 0,
  total_unfiltered: 0,
};

interface DownloadBody {
  ids?: string[];
  date_from?: string;
  date_to?: string;
  time_from?: string;
  time_to?: string;
  search?: string;
  candidate_name?: string;
}

/** The from/to filter above the table. A time is only meaningful beside its own date. */
interface DateRange {
  dateFrom: string;
  timeFrom: string;
  dateTo: string;
  timeTo: string;
}

const EMPTY_RANGE: DateRange = { dateFrom: '', timeFrom: '', dateTo: '', timeTo: '' };

/**
 * A history row's stamp split for the table: ["2026-08-25", "14:32"].
 *
 * Rows generated before the time of day was recorded carry a bare date, so the time
 * half comes back empty and the table shows a dash rather than a made-up midnight.
 */
function splitStamp(raw: string): [string, string] {
  const [day = '', rest = ''] = (raw || '').trim().replace('T', ' ').split(' ');
  return [day.slice(0, 10), rest.slice(0, 5)];
}

/**
 * Every resume ever generated for the selected profile, and the only place files are
 * downloaded from.
 *
 * The filters, the ordering and the paging all happen on the server: a profile with
 * thousands of generations would otherwise ship — and re-parse — the lot on every page
 * load. That also means "download everything matching the filter" sends the *filter*
 * rather than a list of ids, so it still means all of it when the browser is holding
 * ten rows.
 */
export function HistoryPanel({
  candidateName,
  /** Bumped by the page after a generation, to pull the new rows to the top. */
  reloadSignal,
}: {
  candidateName: string;
  reloadSignal: number;
}) {
  const [data, setData] = useState<HistoryResponse>(EMPTY_HISTORY);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [range, setRange] = useState<DateRange>(EMPTY_RANGE);
  const { dateFrom, timeFrom, dateTo, timeTo } = range;
  const [searchInput, setSearchInput] = useState('');
  const [downloading, setDownloading] = useState(false);
  // Bumped to force a refetch with identical filters — the Refresh button, and the
  // reload after a generation lands on the page the user is already on.
  const [nonce, setNonce] = useState(0);

  const search = useDebouncedValue(searchInput, 350);

  const load = useCallback(async () => {
    // Read only so that bumping the nonce re-runs this fetch with identical filters.
    void nonce;
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      };
      if (candidateName.trim()) params.candidate_name = candidateName.trim();
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (timeFrom) params.time_from = timeFrom;
      if (timeTo) params.time_to = timeTo;
      if (search) params.search = search;
      const res = await axios.get<HistoryResponse>(`${API_BASE_URL}/api/company-roles-history`, {
        params,
      });
      setData({ ...EMPTY_HISTORY, ...res.data, history: res.data.history || [] });
    } catch {
      setData(EMPTY_HISTORY);
    } finally {
      setLoading(false);
    }
  }, [candidateName, page, dateFrom, dateTo, timeFrom, timeTo, search, nonce]);

  useEffect(() => {
    load();
  }, [load]);

  // A new search term is a different question — start at the top with nothing ticked.
  // Guarded, so the first run (when the debounced term is still empty) costs no render.
  useEffect(() => {
    setPage((p) => (p === 1 ? p : 1));
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, [search]);

  // Switching profile shows a different history entirely, so neither the page number nor
  // the ticked rows carry over. Guarded so it costs nothing when they are already clear —
  // otherwise this fires on the initial profile load and doubles the first fetch.
  useEffect(() => {
    setPage((p) => (p === 1 ? p : 1));
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, [candidateName]);

  /**
   * Reload after a generation, back at page one.
   *
   * The new rows are the newest ones, so they are on the first page — which is not
   * where the user necessarily is. Moving pages re-fetches by itself through the
   * loader's dependencies; already being on page one is the case that needs the nonce.
   */
  useEffect(() => {
    if (reloadSignal === 0) return;
    // Both, unconditionally: setting the page to 1 when it is already 1 is a no-op, and
    // the nonce is what makes that case refetch at all. React batches them into one run
    // of the loader, so this is never two requests.
    setPage(1);
    setNonce((n) => n + 1);
  }, [reloadSignal]);

  const rows = data.history;
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  useEffect(() => {
    if (!loading && page > totalPages) setPage(totalPages);
  }, [loading, page, totalPages]);

  // Rows generated before file history existed, or while Drive was disconnected, have
  // no file ids — nothing to download, so they can't be selected either.
  const pageSelectableIds = useMemo(
    () => rows.filter((r) => r.downloadable).map((r) => r.id),
    [rows]
  );
  const selectedCount = selectedIds.size;
  const selectedOnPage = pageSelectableIds.filter((id) => selectedIds.has(id)).length;
  const headerChecked: boolean | 'indeterminate' =
    pageSelectableIds.length > 0 && selectedOnPage === pageSelectableIds.length
      ? true
      : selectedOnPage > 0
        ? 'indeterminate'
        : false;

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /**
   * Header checkbox: every downloadable row on this page.
   *
   * Ticks survive paging — the selection is a set of ids, not a slice — and taking the
   * whole filtered set is what the Download-all button is for; it sends the filter
   * rather than the ids, so the server never has to name them.
   */
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (headerChecked === true) pageSelectableIds.forEach((id) => next.delete(id));
      else pageSelectableIds.forEach((id) => next.add(id));
      return next;
    });
  };

  /**
   * Narrow the range and go back to a clean first page.
   *
   * Clearing a date clears the time beside it: the server ignores a time with no date
   * of its own, and leaving one on screen would show a filter that isn't being applied.
   */
  const applyRange = (patch: Partial<DateRange>) => {
    setRange((prev) => {
      const next = { ...prev, ...patch };
      if (!next.dateFrom) next.timeFrom = '';
      if (!next.dateTo) next.timeTo = '';
      return next;
    });
    setPage(1);
    setSelectedIds(new Set());
  };

  const hasFilters = !!(dateFrom || dateTo || searchInput);

  const clearFilters = () => {
    setSearchInput('');
    applyRange(EMPTY_RANGE);
  };

  /**
   * ZIP any set of past generations, a folder per resume.
   *
   * The server reads these from Drive by file id, so this works for anything in the
   * history — not only what this session generated.
   */
  const downloadHistory = async (body: DownloadBody, filename: string) => {
    setDownloading(true);
    try {
      const payload: DownloadBody = { ...body };
      if (candidateName.trim()) payload.candidate_name = candidateName.trim();
      const response = await axios.post(`${API_BASE_URL}/api/download/history`, payload, {
        responseType: 'blob',
      });
      saveBlob(response.data, filename);

      const missing = parseInt(response.headers['x-missing-files'], 10);
      if (missing > 0) {
        notify.warning(
          'Download ready, with gaps.',
          `${missing} ${plural(missing, 'file')} could not be found in Google Drive — they may have been deleted or moved there.`
        );
      } else {
        notify.success('Download ready.');
      }
    } catch (err) {
      notify.error(await blobErrorDetail(err, 'Error downloading files'));
    } finally {
      setDownloading(false);
    }
  };

  const downloadSelected = () =>
    downloadHistory({ ids: [...selectedIds] }, `resumes_${selectedIds.size}_selected.zip`);

  /** Everything the filter currently shows — or the whole history when there is none. */
  const downloadFiltered = () => {
    const body: DownloadBody = {};
    if (dateFrom) body.date_from = dateFrom;
    if (dateTo) body.date_to = dateTo;
    if (timeFrom) body.time_from = timeFrom;
    if (timeTo) body.time_to = timeTo;
    if (search) body.search = search;
    const name =
      dateFrom && dateTo
        ? `resumes_${dateFrom}_to_${dateTo}.zip`
        : `resumes_${data.downloadable}_selected.zip`;
    return downloadHistory(body, name);
  };

  return (
    <Card>
      <CardHeader
        icon={FileStack}
        title="Generated resumes"
        description="Every resume generated for the selected profile — by you or by anyone else assigned it, so you can see what has already been applied for. Click a row's file count to open its folder in Google Drive, or tick the ones you want and download them as a ZIP."
        actions={
          <>
            <Badge tone="neutral">
              {formatNumber(data.total_unfiltered)} total
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={() => setNonce((n) => n + 1)}
              loading={loading}
            >
              Refresh
            </Button>
          </>
        }
      />

      <CardBody className="space-y-4">
        {/* The toolbar stays mounted through a fetch. Every page turn and every keystroke
            in the search box is a request, and unmounting this would take the caret out
            of the box mid-word. Only the rows below swap for a loading state. */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1 space-y-1.5">
            <FilterLabel>Search</FilterLabel>
            {/* Searches the whole history, not the page on screen — the server matches
                company, role and job URL across every row of the profile. */}
            <SearchInput
              icon={<Search className="h-4 w-4" />}
              placeholder="Company, role or job URL"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search generated resumes"
            />
          </div>

          {/* Date and time are one control each side of the range: the time narrows the
              day its date picked, and is disabled until there is a day to narrow. Left
              empty it means the whole day — midnight to 23:59:59 — so a date-only
              filter still reads as the plain "that day" it always did. */}
          <div className="space-y-1.5">
            <FilterLabel>
              <CalendarDays className="mr-1 inline h-3 w-3" aria-hidden="true" />
              From
            </FilterLabel>
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                className="w-[9.5rem]"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => applyRange({ dateFrom: e.target.value })}
                aria-label="Generated on or after"
              />
              <HintWrap hint={dateFrom ? undefined : 'Pick a From date first'} disabled={!dateFrom}>
                <Input
                  type="time"
                  className="w-[7.5rem]"
                  value={timeFrom}
                  disabled={!dateFrom}
                  max={dateTo && dateTo === dateFrom ? timeTo || undefined : undefined}
                  onChange={(e) => applyRange({ timeFrom: e.target.value })}
                  aria-label="Generated at or after this time of day"
                />
              </HintWrap>
            </div>
          </div>
          <div className="space-y-1.5">
            <FilterLabel>To</FilterLabel>
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                className="w-[9.5rem]"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => applyRange({ dateTo: e.target.value })}
                aria-label="Generated on or before"
              />
              <HintWrap hint={dateTo ? undefined : 'Pick a To date first'} disabled={!dateTo}>
                <Input
                  type="time"
                  className="w-[7.5rem]"
                  value={timeTo}
                  disabled={!dateTo}
                  min={dateFrom && dateFrom === dateTo ? timeFrom || undefined : undefined}
                  onChange={(e) => applyRange({ timeTo: e.target.value })}
                  aria-label="Generated at or before this time of day"
                />
              </HintWrap>
            </div>
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" icon={FilterX} onClick={clearFilters}>
              Clear
            </Button>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <HintWrap
              hint={selectedCount === 0 ? 'Tick some rows first' : 'ZIP the ticked resumes, one folder each'}
              disabled={selectedCount === 0}
            >
              <Button
                variant="success"
                size="sm"
                icon={Download}
                onClick={downloadSelected}
                loading={downloading && selectedCount > 0}
                disabled={downloading || selectedCount === 0}
              >
                Download selected{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </Button>
            </HintWrap>
            <Tooltip
              content={
                hasFilters
                  ? 'ZIP every downloadable resume matching the current filter'
                  : 'ZIP every downloadable resume in the history'
              }
            >
              <Button
                variant="primary"
                size="sm"
                icon={Download}
                onClick={downloadFiltered}
                disabled={downloading || data.downloadable === 0}
              >
                {hasFilters
                  ? `Download filtered (${data.downloadable})`
                  : `Download all (${data.downloadable})`}
              </Button>
            </Tooltip>
          </div>
        </div>

        {selectedCount > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand-soft px-3.5 py-2 text-sm">
            <span className="font-medium text-brand">
              {selectedCount} {plural(selectedCount, 'resume')} selected
            </span>
            <span className="text-xs text-muted">Selections are kept as you change pages.</span>
            <Button
              variant="link"
              size="sm"
              className="ml-auto"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear selection
            </Button>
          </div>
        )}

        {loading && rows.length === 0 ? (
          <TableSkeleton rows={5} columns={7} />
        ) : data.total === 0 ? (
          data.total_unfiltered === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Nothing generated yet"
              description="Paste a job link below and generate a resume — it will show up here, with its files, the moment it is done."
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="No resumes match that filter"
              description={`${formatNumber(data.total_unfiltered)} ${plural(data.total_unfiltered, 'resume')} exist for this profile — none of them match what you searched for.`}
              action={
                <Button variant="secondary" size="sm" icon={FilterX} onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          )
        ) : (
          /* Rows already on screen stay put and just dim while the next page arrives —
             the table doesn't collapse and reflow on every click. */
          <TableWrap dimmed={loading} maxHeight="34rem">
              <Table>
                <THead>
                  <tr>
                    <TH className="w-10 pl-4">
                      <Tooltip content="Select every downloadable resume on this page">
                        <span className="inline-flex">
                          <Checkbox
                            checked={headerChecked}
                            onCheckedChange={toggleSelectAll}
                            disabled={pageSelectableIds.length === 0}
                            aria-label="Select all downloadable resumes on this page"
                          />
                        </span>
                      </Tooltip>
                    </TH>
                    <TH>Date</TH>
                    <TH>Time</TH>
                    <TH>Company</TH>
                    <TH>Role</TH>
                    <TH>Job URL</TH>
                    <TH>Generated by</TH>
                    <TH className="text-right">Files</TH>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <HistoryTableRow
                      key={row.id}
                      row={row}
                      candidateName={candidateName}
                      selected={selectedIds.has(row.id)}
                      onToggle={() => toggleRow(row.id)}
                    />
                  ))}
                </TBody>
            </Table>
          </TableWrap>
        )}
      </CardBody>

      {data.total > PAGE_SIZE && (
        <CardFooter>
          <Pagination
            className="w-full"
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            disabled={loading}
            summary={`${formatNumber(data.total)} ${plural(data.total, 'resume')} · ${formatNumber(data.downloadable)} with files`}
          />
        </CardFooter>
      )}
    </Card>
  );
}

/** Shared by both halves of the Files cell, so the row reads the same either way. */
const FILE_LINK_CLASS = 'inline-flex items-center gap-1 text-brand hover:underline';

/**
 * The "n files" link: opens that generation's folder in Google Drive.
 *
 * The folder lives in the Drive of whoever generated the resume, created with
 * `drive.file` scope and shared with nobody, so a plain link only ever worked for its
 * owner. For everyone else the click asks the server first, which grants this user read
 * access to that one folder using the owner's credentials and returns the link.
 *
 * The tab is opened *before* awaiting that request, because a `window.open` that happens
 * after an await is no longer attributable to the click and browsers block it. It starts
 * blank and is pointed at Drive when the answer arrives - or closed again if it doesn't.
 * `noopener` is deliberately not passed to `open`: with it the call returns null and
 * there is no tab left to redirect. The handle is severed by hand instead.
 */
function DriveFolderLink({ row, candidateName }: { row: HistoryRow; candidateName: string }) {
  const [opening, setOpening] = useState(false);
  const fileNames = row.files.map((f) => f.name).join(', ');
  const label = `${row.files.length} ${plural(row.files.length, 'file')}`;
  const folderUrl = `https://drive.google.com/drive/folders/${row.drive_folder_id}`;

  if (row.mine) {
    return (
      <a
        href={folderUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={FILE_LINK_CLASS}
        title={fileNames}
      >
        {label}
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    );
  }

  const open = async () => {
    if (opening) return;
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    setOpening(true);
    try {
      const params: { id: string; candidate_name?: string } = { id: row.id };
      if (candidateName.trim()) params.candidate_name = candidateName.trim();
      const res = await axios.post<HistoryDriveLinkResponse>(
        `${API_BASE_URL}/api/history/drive-link`,
        params
      );
      if (tab) tab.location.href = res.data.link;
      // The popup was blocked despite the click - fall back to this tab rather than
      // silently doing nothing.
      else window.location.href = res.data.link;
    } catch (err) {
      tab?.close();
      notify.error(
        'Could not open the Drive folder',
        errorDetail(err, 'Google Drive did not grant access to this folder.')
      );
    } finally {
      setOpening(false);
    }
  };

  return (
    <Tooltip
      content={`Open in Google Drive - ${row.owner_email || 'whoever generated this'} shares the folder with you`}
    >
      <button
        type="button"
        onClick={open}
        disabled={opening}
        className={cn(FILE_LINK_CLASS, 'disabled:opacity-60')}
        title={fileNames}
      >
        {label}
        {opening ? (
          <Spinner className="h-3 w-3" />
        ) : (
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        )}
      </button>
    </Tooltip>
  );
}

function HistoryTableRow({
  row,
  candidateName,
  selected,
  onToggle,
}: {
  row: HistoryRow;
  candidateName: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const fileNames = row.files.map((f) => f.name).join(', ');
  const [day, time] = splitStamp(row.date || '');
  return (
    <TR selected={selected}>
      <TD className="pl-4">
        <Tooltip
          content={
            row.downloadable
              ? 'Include in download'
              : 'No files stored for this one — it can only be regenerated'
          }
        >
          <span className="inline-flex">
            <Checkbox
              checked={selected}
              disabled={!row.downloadable}
              onCheckedChange={onToggle}
              aria-label={`Select ${row.company || 'resume'} ${row.role || ''}`}
            />
          </span>
        </Tooltip>
      </TD>
      <TD className="whitespace-nowrap tabular-nums text-muted">{day || '—'}</TD>
      <TD className="whitespace-nowrap tabular-nums text-muted">
        {time || (
          <Tooltip content="Generated before the time of day was recorded">
            <span className="text-subtle">&mdash;</span>
          </Tooltip>
        )}
      </TD>
      <TD className="font-medium">{row.company || '—'}</TD>
      <TD className="max-w-[16rem]">
        <span className="block truncate" title={row.role}>
          {row.role || '—'}
        </span>
      </TD>
      {/* The cell is capped and the link laid out as a *block* flex row: an inline-flex
          anchor is sized shrink-to-fit from its content, so an unbreakable URL made the
          cell wider than the cap and spilled over the next column. */}
      <TD className="max-w-[18rem]">
        {row.url ? (
          <a
            href={row.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-1 text-brand hover:underline"
            title={row.url}
          >
            <span className="truncate">{row.url}</span>
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
          </a>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </TD>
      <TD className="max-w-[14rem]">
        {row.mine ? (
          <Badge tone="brand">You</Badge>
        ) : (
          <span
            className="block truncate text-xs text-muted"
            title={row.owner_email || 'Another user of this profile'}
          >
            {row.owner_email || '—'}
          </span>
        )}
      </TD>
      <TD className="text-right">
        {row.downloadable ? (
          // Rows from before folder ids were recorded have files but no folder to open;
          // they stay a plain count and are downloaded through the ZIP button.
          row.drive_folder_id ? (
            <DriveFolderLink row={row} candidateName={candidateName} />
          ) : (
            <span className="tabular-nums text-muted" title={fileNames}>
              {row.files.length}
            </span>
          )
        ) : (
          <Tooltip content="Generated before files were kept, or while Drive was disconnected">
            <span className={cn('text-xs text-subtle')}>Not stored</span>
          </Tooltip>
        )}
      </TD>
    </TR>
  );
}

export default HistoryPanel;
