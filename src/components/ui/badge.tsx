import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-2xs font-medium',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-surface-2 text-muted',
        brand: 'border-brand/25 bg-brand-soft text-brand',
        success: 'border-success/25 bg-success-soft text-success-fg',
        warning: 'border-warning/30 bg-warning-soft text-warning-fg',
        danger: 'border-danger/25 bg-danger-soft text-danger-fg',
        info: 'border-info/25 bg-info-soft text-info-fg',
      },
    },
    defaultVariants: { tone: 'neutral' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** A filled circle before the label — for live status, where colour alone reads thin. */
  dot?: boolean;
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}
