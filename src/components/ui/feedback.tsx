import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

/** A grey block standing in for content that is still loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden="true" />;
}

/**
 * Table-shaped loading state.
 *
 * Showing the shape of what is coming, rather than the word "Loading…", means the page
 * does not jump when the rows arrive — the space they will occupy is already reserved.
 */
export function TableSkeleton({ rows = 5, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-border rounded-xl border border-border" aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-3 py-3.5">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn('h-3.5', c === 0 ? 'w-24' : c === columns - 1 ? 'w-16' : 'flex-1')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Nothing to show, and why.
 *
 * "No rows" and "no rows *matching that filter*" are different situations with
 * different next steps, so callers are expected to pass an action for the second.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-2/40 px-6 py-12 text-center',
        className
      )}
    >
      {Icon && (
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-surface text-subtle shadow-xs">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/**
 * A determinate progress bar with a label above it.
 *
 * Generation runs one job at a time and can take minutes; without this the only signal
 * that anything is happening is a disabled button.
 */
export function ProgressBar({
  current,
  total,
  label,
  className,
}: {
  current: number;
  total: number;
  label?: React.ReactNode;
  className?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-muted">{label}</span>
        <span className="shrink-0 font-medium tabular-nums text-fg">
          {current} / {total}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** A thin bar for work with no measurable progress — a fetch, an upload. */
export function IndeterminateBar({ className }: { className?: string }) {
  return (
    <div className={cn('h-0.5 w-full overflow-hidden rounded-full bg-surface-2', className)}>
      <div className="h-full w-1/3 animate-indeterminate rounded-full bg-brand" />
    </div>
  );
}
