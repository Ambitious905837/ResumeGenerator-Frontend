import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * A labelled form control.
 *
 * The label is wired to the control by a generated id rather than by nesting, so the
 * hint text below can sit outside the clickable label area — clicking a paragraph of
 * explanation should not focus the field.
 */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  required,
  className,
  children,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="flex items-center gap-1 text-sm font-medium text-fg"
        >
          {label}
          {required && (
            <span className="text-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger-fg">{error}</p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn('field-base h-9', className)} {...props} />;
  }
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn('field-base resize-y leading-relaxed', className)} {...props} />;
});

/**
 * A native <select>, restyled.
 *
 * Deliberately native rather than the Radix listbox: these menus hold profile names and
 * user lists that can run into the hundreds, and the native control gets type-ahead,
 * virtualised scrolling and the platform's own mobile picker for free.
 */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn('field-base h-9 cursor-pointer appearance-none pr-9', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
        aria-hidden="true"
      />
    </div>
  );
});

/** A search box with the magnifier baked in, so every one of them looks the same. */
export const SearchInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }
>(function SearchInput({ className, icon, ...props }, ref) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle">
        {icon}
      </span>
      <input ref={ref} type="search" className={cn('field-base h-9 pl-9', className)} {...props} />
    </div>
  );
});

/**
 * A small label above a filter control in a toolbar.
 *
 * `block` matters: next to a block-level input it would sit above either way, but next
 * to an inline-flex control (the segmented switches) an inline span shares the line and
 * that one filter ends up laid out differently from all the others.
 */
export function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-2xs font-semibold uppercase tracking-wider text-subtle">
      {children}
    </span>
  );
}
