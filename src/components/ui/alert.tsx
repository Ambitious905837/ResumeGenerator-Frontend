import React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const alertVariants = cva('flex gap-3 rounded-xl border p-3.5 text-sm', {
  variants: {
    tone: {
      info: 'border-info/25 bg-info-soft text-info-fg',
      success: 'border-success/25 bg-success-soft text-success-fg',
      warning: 'border-warning/30 bg-warning-soft text-warning-fg',
      error: 'border-danger/25 bg-danger-soft text-danger-fg',
    },
  },
  defaultVariants: { tone: 'info' },
});

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
} as const;

export type AlertTone = keyof typeof ICONS;

export interface AlertProps
  // `title` is redefined as a node, not the DOM attribute's plain string — it is the
  // alert's heading, not a hover tooltip.
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>,
    VariantProps<typeof alertVariants> {
  title?: React.ReactNode;
}

/**
 * A persistent, in-place explanation — a precondition that is not met, a setting that
 * is missing. Anything that is merely the *outcome* of an action the user just took
 * belongs in a toast instead, so the page does not accumulate stale banners.
 */
export function Alert({ className, tone, title, children, ...props }: AlertProps) {
  const Icon = ICONS[(tone ?? 'info') as AlertTone];
  return (
    <div role="status" className={cn(alertVariants({ tone }), className)} {...props}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 leading-relaxed [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2">
        {title && <div className="font-semibold">{title}</div>}
        {children}
      </div>
    </div>
  );
}
