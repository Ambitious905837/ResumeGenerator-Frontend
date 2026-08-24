import React from 'react';
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * A checkbox with a real indeterminate state.
 *
 * The table header uses it: with some but not all rows on the page ticked, a plain
 * checked/unchecked box would claim the wrong thing about what clicking it will do.
 */
export const Checkbox = React.forwardRef<
  React.ElementRef<typeof RadixCheckbox.Root>,
  React.ComponentPropsWithoutRef<typeof RadixCheckbox.Root>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <RadixCheckbox.Root
      ref={ref}
      className={cn(
        'peer grid h-4 w-4 shrink-0 place-items-center rounded border border-border-strong bg-surface',
        'transition-colors hover:border-brand disabled:cursor-not-allowed disabled:opacity-45',
        'data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:text-brand-fg',
        'data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand data-[state=indeterminate]:text-brand-fg',
        className
      )}
      {...props}
    >
      <RadixCheckbox.Indicator className="grid place-items-center">
        {props.checked === 'indeterminate' ? (
          <Minus className="h-3 w-3" strokeWidth={3} />
        ) : (
          <Check className="h-3 w-3" strokeWidth={3} />
        )}
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
});

/** Checkbox plus a clickable label, for lists of options. */
export function CheckboxField({
  checked,
  onCheckedChange,
  disabled,
  children,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2',
        'text-sm transition-colors hover:border-border-strong hover:bg-surface-2',
        checked && 'border-brand/40 bg-brand-soft',
        disabled && 'cursor-not-allowed opacity-60',
        className
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
      />
      <span className="min-w-0 truncate">{children}</span>
    </label>
  );
}
