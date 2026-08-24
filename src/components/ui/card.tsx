import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * A titled panel. Every screen in the app is a stack of these.
 *
 * The header is a flex row rather than a block so a panel can put its own controls
 * (Refresh, Show/Hide) opposite the title without each screen re-inventing the layout.
 */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn('rounded-2xl border border-border bg-surface shadow-sm', className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** Buttons or badges shown opposite the title. */
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6',
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <h2 className="text-base font-semibold tracking-tight text-fg">{title}</h2>
        </div>
        {description && (
          <p className="mt-2 max-w-3xl break-words text-sm leading-relaxed text-muted">
            {description}
          </p>
        )}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-5 sm:px-6 sm:py-6', className)} {...props} />;
}

/** A muted strip at the bottom of a panel — pagination, totals, secondary actions. */
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-b-2xl border-t border-border bg-surface-2/60 px-5 py-3 sm:px-6',
        className
      )}
      {...props}
    />
  );
}

/** A heading inside a card body, for a panel with more than one distinct part. */
export function SectionHeading({
  children,
  hint,
  className,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3', className)}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-subtle">{children}</h3>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}
