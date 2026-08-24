import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Spinner } from './spinner';

const buttonVariants = cva(
  // Shared: the hit area, the type, and the states every button has.
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg ' +
    'font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ' +
    'active:translate-y-px disabled:pointer-events-none disabled:opacity-55 ' +
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** The one action a panel is really for. At most one per panel. */
        primary: 'bg-brand text-brand-fg shadow-xs hover:bg-brand-hover',
        /** Everything else: refresh, cancel, secondary navigation. */
        secondary:
          'border border-input bg-surface text-fg shadow-xs hover:border-border-strong hover:bg-surface-2',
        /** Completing something the user asked for — downloads, mostly. */
        success: 'bg-success text-white shadow-xs hover:bg-success/90',
        /** Destructive and irreversible. */
        danger: 'bg-danger text-white shadow-xs hover:bg-danger/90',
        /** Sits inside dense rows and toolbars where a border would add noise. */
        ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
        /** Reads as a link but behaves as a button. */
        link: 'h-auto p-0 text-brand underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs [&_svg]:size-3.5',
        md: 'h-9 px-3.5 text-sm [&_svg]:size-4',
        lg: 'h-11 px-5 text-sm [&_svg]:size-4',
        icon: 'h-9 w-9 [&_svg]:size-4',
        'icon-sm': 'h-8 w-8 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as the single child element instead of a <button> — for links styled as buttons. */
  asChild?: boolean;
  /**
   * Swaps the leading icon for a spinner and disables the button. The label stays put,
   * so the button does not change width mid-action and shift everything beside it.
   */
  loading?: boolean;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    asChild,
    loading,
    icon: Icon,
    iconRight: IconRight,
    children,
    disabled,
    ...props
  },
  ref
) {
  const classes = cn(buttonVariants({ variant, size }), className);

  // `asChild` hands the styling to the caller's own element — typically an <a> that
  // should look like a button. Radix's Slot requires exactly one element child, so the
  // icon/spinner slots are not rendered here: padding them with `null` still trips
  // Slot's child check, and an anchor supplies its own content anyway.
  if (asChild) {
    return (
      <Slot ref={ref} className={classes} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : Icon ? <Icon /> : null}
      {children}
      {IconRight && !loading ? <IconRight /> : null}
    </button>
  );
});

export { buttonVariants };
