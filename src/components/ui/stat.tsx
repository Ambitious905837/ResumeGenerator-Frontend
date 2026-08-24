import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * One headline figure.
 *
 * The number is the largest thing in the tile and is tabular-figured, so a row of tiles
 * lines up digit-for-digit instead of shifting as the values change.
 */
export function Stat({
  label,
  value,
  sub,
  hint,
  icon: Icon,
  emphasis,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** The secondary line — cost, tokens, whatever qualifies the headline number. */
  sub?: React.ReactNode;
  /** A third, quieter line — usually what date range the figure covers. */
  hint?: React.ReactNode;
  icon?: LucideIcon;
  /** Marks the tile that answers the question currently being asked. */
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-surface p-4 shadow-xs transition-colors',
        emphasis ? 'border-brand/40 bg-brand-soft/50 ring-1 ring-brand/15' : 'border-border',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wider text-subtle">{label}</span>
        {Icon && <Icon className="h-3.5 w-3.5 text-subtle" aria-hidden="true" />}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-fg">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
      {hint && <div className="mt-0.5 text-xs text-subtle">{hint}</div>}
    </div>
  );
}

/** The responsive grid the tiles sit in. */
export function StatGrid({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4', className)}
      {...props}
    />
  );
}
