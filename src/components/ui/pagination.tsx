import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from './button';

/**
 * Previous / page-number / Next.
 *
 * The page box is a controlled input with its own draft state: typing "12" in a
 * three-page table would otherwise be clamped to 3 the moment the "1" is typed, making
 * any two-digit page impossible to enter. The draft is only committed — and only then
 * validated — on blur or Enter.
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  summary,
  disabled,
  className,
}: {
  /** 1-based. */
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  summary?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(page));

  useEffect(() => {
    setDraft(String(page));
  }, [page]);

  const commit = () => {
    const value = parseInt(draft, 10);
    if (!Number.isNaN(value) && value >= 1 && value <= totalPages) onPageChange(value);
    else setDraft(String(page));
  };

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <span className="text-xs text-muted">{summary}</span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={ChevronLeft}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={disabled || page <= 1}
        >
          Previous
        </Button>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="text"
            inputMode="numeric"
            aria-label={`Page number, 1 to ${totalPages}`}
            className="field-base h-8 w-12 px-2 text-center text-xs tabular-nums"
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commit();
                e.currentTarget.blur();
              }
            }}
          />
          <span className="whitespace-nowrap">of {totalPages}</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          iconRight={ChevronRight}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={disabled || page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

/** Prev/Next only, for offset-paged lists that have no meaningful page count. */
export function SimplePager({
  onPrevious,
  onNext,
  previousDisabled,
  nextDisabled,
  summary,
  previousLabel = 'Previous',
  nextLabel = 'Next',
  className,
}: {
  onPrevious: () => void;
  onNext: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  summary?: React.ReactNode;
  previousLabel?: string;
  nextLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <span className="text-xs tabular-nums text-muted">{summary}</span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" icon={ChevronLeft} onClick={onPrevious} disabled={previousDisabled}>
          {previousLabel}
        </Button>
        <Button variant="secondary" size="sm" iconRight={ChevronRight} onClick={onNext} disabled={nextDisabled}>
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}
