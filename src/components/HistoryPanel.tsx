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
import { blobErrorDetail, saveBlob } from '../lib/download';
import { formatNumber, plural, truncate } from '../lib/format';
import { notify } from '../lib/notify';
import { cn } from '../lib/cn';
import type { HistoryResponse, HistoryRow } from '../types/api';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardBody, CardFooter, CardHeader } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { FilterLabel, Input, SearchInput } from './ui/field';
import { EmptyState, TableSkeleton } from './ui/feedback';
import { Pagination } from './ui/pagination';
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
  search?: string;
  candidate_name?: string;
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
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
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
  }, [candidateName, page, dateFrom, dateTo, search, nonce]);

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

  const applyDateFilter = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
    setPage(1);
    setSelectedIds(new Set());
  };

  const hasFilters = !!(dateFrom || dateTo || searchInput);

  const clearFilters = () => {
    setSearchInput('');
    applyDateFilter('', '');
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
        description="Every resume generated for the selected profile — by you or by anyone else assigned it, so you can see what has already been applied for. Tick the ones you want and download them as a ZIP, including resumes from earlier sessions."
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

          <div className="space-y-1.5">
            <FilterLabel>
              <CalendarDays className="mr-1 inline h-3 w-3" aria-hidden="true" />
              From
            </FilterLabel>
            <Input
              type="date"
              className="w-[9.5rem]"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => applyDateFilter(e.target.value, dateTo)}
              aria-label="Generated on or after"
            />
          </div>
          <div className="space-y-1.5">
            <FilterLabel>To</FilterLabel>
            <Input
              type="date"
              className="w-[9.5rem]"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => applyDateFilter(dateFrom, e.target.value)}
              aria-label="Generated on or before"
            />
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
          <TableSkeleton rows={5} columns={6} />
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

function HistoryTableRow({
  row,
  selected,
  onToggle,
}: {
  row: HistoryRow;
  selected: boolean;
  onToggle: () => void;
}) {
  const fileNames = row.files.map((f) => f.name).join(', ');
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
      <TD className="whitespace-nowrap tabular-nums text-muted">{(row.date || '').slice(0, 10)}</TD>
      <TD className="font-medium">{row.company || '—'}</TD>
      <TD className="max-w-[16rem]">
        <span className="block truncate" title={row.role}>
          {row.role || '—'}
        </span>
      </TD>
      <TD className="max-w-[18rem]">
        {row.url ? (
          <a
            href={row.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-brand hover:underline"
            title={row.url}
          >
            <span className="truncate">{truncate(row.url, 44)}</span>
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
          </a>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </TD>
      <TD>
        {row.mine ? (
          <Badge tone="brand">You</Badge>
        ) : (
          <span className="text-xs text-muted" title={row.owner_email || 'Another user of this profile'}>
            {row.owner_email || '—'}
          </span>
        )}
      </TD>
      <TD className="text-right">
        {row.downloadable ? (
          // The Drive folder is in the generator's own account and is not shared, so
          // only link it for them. Everyone else downloads through the ZIP button,
          // which fetches with the owner's token.
          row.drive_folder_id && row.mine ? (
            <a
              href={`https://drive.google.com/drive/folders/${row.drive_folder_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-brand hover:underline"
              title={fileNames}
            >
              {row.files.length} {plural(row.files.length, 'file')}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
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
