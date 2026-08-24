import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Join class names, letting a later Tailwind class win over an earlier one in the same
 * group. Without the merge, a `className` prop passed into a component would sit
 * *alongside* the component's own padding rather than replacing it, and which one
 * applied would come down to stylesheet order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
