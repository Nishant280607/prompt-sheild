import { twMerge } from 'tailwind-merge';

/**
 * Join class names; later Tailwind classes override conflicting earlier ones,
 * e.g. cn('px-4 py-2.5 text-sm', 'py-0 text-xs') -> 'px-4 py-0 text-xs'.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter(Boolean).join(' '));
}
