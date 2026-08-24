import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type Theme } from '../theme';
import { cn } from '../lib/cn';
import { Tooltip } from './ui/tooltip';

const OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Match system', icon: Monitor },
];

/**
 * Light / dark / system, as three small buttons rather than a two-state switch.
 *
 * A plain toggle cannot express "follow the OS", so a user who wants the app to change
 * with their machine at sunset has no way to say so — and once they have toggled it
 * once, no way back.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn('inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5', className)}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <Tooltip key={value} content={label}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              onClick={() => setTheme(value)}
              className={cn(
                'grid h-7 w-7 place-items-center rounded-md transition-colors',
                active ? 'bg-surface text-fg shadow-xs' : 'text-subtle hover:text-fg'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
