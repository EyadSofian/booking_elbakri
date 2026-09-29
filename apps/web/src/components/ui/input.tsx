import * as React from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-md border border-input bg-surface px-3 text-sm shadow-xs transition-colors ' +
  'placeholder:text-muted-foreground/70 hover:border-foreground/25 ' +
  'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  'aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, invalid, dir, ...props }, ref) => (
  // dir="auto": English typed into an Arabic screen reads left-to-right, and vice versa.
  <input ref={ref} dir={dir ?? 'auto'} aria-invalid={invalid || undefined} className={cn(control, 'h-9', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, dir, ...props }, ref) => (
  <textarea ref={ref} dir={dir ?? 'auto'} aria-invalid={invalid || undefined} className={cn(control, 'min-h-[76px] py-2 leading-relaxed', className)} {...props} />
));
Textarea.displayName = 'Textarea';

/** A native select — fast, accessible and right-to-left aware on every phone. */
export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(({ className, invalid, children, ...props }, ref) => (
  <select
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      control,
      'select-arrow h-9 cursor-pointer appearance-none pe-8',
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
NativeSelect.displayName = 'NativeSelect';
