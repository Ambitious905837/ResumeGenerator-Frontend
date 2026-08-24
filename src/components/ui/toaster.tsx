import React from 'react';
import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from '../../theme';

/**
 * Transient outcome messages.
 *
 * The old UI parked every result in an inline banner, so a page slowly filled with
 * stale news — "Download ready." still sitting there ten minutes later. Outcomes are
 * toasts now; the inline `Alert` is reserved for standing conditions (Drive not
 * connected, no profile assigned) that remain true until something is done about them.
 *
 * Colours come from the app's own tokens rather than sonner's `richColors`, so a toast
 * matches the theme on both sides of the light/dark switch.
 */
export function Toaster() {
  const { resolved } = useTheme();
  return (
    <SonnerToaster
      theme={resolved}
      position="bottom-right"
      closeButton
      duration={5000}
      toastOptions={{
        classNames: {
          toast:
            'group rounded-xl border border-border bg-overlay text-fg shadow-pop text-sm items-start gap-3',
          title: 'font-medium text-fg',
          description: 'text-muted text-xs leading-relaxed',
          actionButton: 'bg-brand text-brand-fg rounded-md px-2 py-1 text-xs font-medium',
          cancelButton: 'bg-surface-2 text-muted rounded-md px-2 py-1 text-xs',
          closeButton: 'bg-surface border-border text-muted hover:text-fg',
          success: '[&_[data-icon]]:text-success',
          error: '[&_[data-icon]]:text-danger',
          warning: '[&_[data-icon]]:text-warning',
          info: '[&_[data-icon]]:text-info',
        },
      }}
    />
  );
}
