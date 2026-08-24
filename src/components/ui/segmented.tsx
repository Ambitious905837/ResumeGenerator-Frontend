import React from 'react';
import { cn } from '../../lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  hint?: string;
}

/**
 * A row of mutually exclusive choices — "Day / Week / Month", or which view of the
 * usage data to show.
 *
 * It is a radiogroup rather than a set of buttons: with plain buttons a keyboard user
 * has to tab past every option, and nothing tells a screen reader that picking one
 * unpicks the others.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface-2 p-1',
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-lg font-medium transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              active
                ? 'bg-surface text-fg shadow-xs'
                : 'text-muted hover:bg-surface/60 hover:text-fg'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
