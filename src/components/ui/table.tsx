import React from 'react';
import { cn } from '../../lib/cn';

/**
 * The scroll container for a table.
 *
 * Wide tables scroll *inside* this box rather than pushing the page sideways, and the
 * header stays put while the body scrolls, so a matrix of twenty date columns is still
 * readable at the bottom. `dimmed` is for a refetch: the rows already on screen stay in
 * place and fade instead of collapsing to a spinner and reflowing the whole page.
 */
export function TableWrap({
  className,
  dimmed,
  maxHeight,
  children,
}: {
  className?: string;
  dimmed?: boolean;
  /** Any CSS length; omit for a table that should grow to its natural height. */
  maxHeight?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative w-full overflow-auto rounded-xl border border-border bg-surface',
        'transition-opacity duration-200',
        dimmed && 'pointer-events-none opacity-50',
        className
      )}
      style={maxHeight ? { maxHeight } : undefined}
    >
      {children}
    </div>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cn('w-full border-collapse text-left text-sm', className)}
      {...props}
    />
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-surface-2', className)} {...props} />;
}

/**
 * A header cell, pinned to the top of the scroll container.
 *
 * The stickiness lives on the cell rather than on <thead>: `position: sticky` on a
 * table section is only honoured by some browsers, and where it is not, the header
 * silently scrolls away — which is exactly the case this is here to prevent.
 */
export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'sticky top-0 z-10 whitespace-nowrap border-b border-border bg-surface-2 px-3 py-2.5',
        'text-2xs font-semibold uppercase tracking-wider text-subtle',
        className
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-border', className)} {...props} />;
}

export function TR({
  className,
  selected,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr
      className={cn(
        'transition-colors hover:bg-surface-2/70',
        selected && 'bg-brand-soft hover:bg-brand-soft',
        className
      )}
      data-selected={selected || undefined}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2.5 align-middle text-fg', className)} {...props} />;
}

/** A full-width "nothing here" row that keeps the table's own frame. */
export function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-muted">
        {children}
      </td>
    </tr>
  );
}

/** Secondary text below the main value in a cell — an email under a name. */
export function CellSub({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mt-0.5 text-xs text-subtle', className)}>{children}</div>;
}
