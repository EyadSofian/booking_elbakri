import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { Status } from '@elbakri/shared';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.72rem] font-medium leading-4',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-muted-foreground',
        sun: 'border-transparent bg-sun-subtle text-sun-foreground',
        success: 'border-transparent bg-success-subtle text-success',
        danger: 'border-transparent bg-danger-subtle text-danger',
        brand: 'border-transparent bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-100',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** The colour of each status — identical on every screen. */
export const STATUS_STYLE: Record<Status, { chip: string; dot: string }> = {
  NEW: { chip: 'bg-st-new-bg text-st-new', dot: 'bg-st-new' },
  IN_PROGRESS: { chip: 'bg-st-progress-bg text-st-progress', dot: 'bg-st-progress' },
  CONFIRMED: { chip: 'bg-st-confirmed-bg text-st-confirmed', dot: 'bg-st-confirmed' },
  DONE: { chip: 'bg-st-done-bg text-st-done', dot: 'bg-st-done' },
  CANCELLED: { chip: 'bg-st-cancelled-bg text-st-cancelled', dot: 'bg-st-cancelled' },
};
