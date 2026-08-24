import React from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { cn } from '../../lib/cn';

export const TooltipProvider = RadixTooltip.Provider;

/**
 * A hover/focus explanation for a control whose label cannot say everything.
 *
 * Wrapping the trigger in a span with `tabIndex` when it is disabled is deliberate:
 * a disabled button fires no pointer events, so the tooltip explaining *why* it is
 * disabled would be the one tooltip that never shows.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  delay = 200,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delay?: number;
}) {
  if (!content) return <>{children}</>;
  return (
    <RadixTooltip.Root delayDuration={delay}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            'z-50 max-w-xs rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs leading-relaxed text-fg shadow-pop',
            'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1'
          )}
        >
          {content}
          <RadixTooltip.Arrow className="fill-border" width={10} height={5} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

/**
 * Tooltip for a control that may be disabled.
 *
 * A disabled <button> swallows pointer events, so the trigger is a wrapper span that
 * stays interactive; without it the explanation for a blocked action never appears.
 */
export function HintWrap({
  hint,
  disabled,
  children,
  className,
}: {
  hint?: React.ReactNode;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  if (!hint) return <>{children}</>;
  return (
    <Tooltip content={hint}>
      <span
        className={cn('inline-flex', disabled && 'cursor-not-allowed', className)}
        // Only an extra tab stop when it has to be one: an enabled button is its own
        // trigger, and making every hinted button two stops is worse than no hint.
        tabIndex={disabled ? 0 : undefined}
      >
        {children}
      </span>
    </Tooltip>
  );
}
