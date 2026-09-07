import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-medium ' +
    'whitespace-nowrap transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        success: 'border-transparent bg-success-subtle text-success',
        warning: 'border-transparent bg-warning-subtle text-warning',
        info: 'border-transparent bg-info-subtle text-info',
        danger: 'border-transparent bg-danger-subtle text-danger',
        brand: 'border-transparent bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-100',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/**
 * Maps a canonical status value to a semantic colour.
 *
 * The value itself stays canonical — only the colour and the label vary, and
 * the label comes from the dictionary, never from the database.
 */
export function statusVariant(status: string | null | undefined): BadgeProps['variant'] {
  switch (status) {
    case 'CONFIRMED':
    case 'COMPLETED':
    case 'APPROVED':
    case 'PAID':
    case 'CHECKED_OUT':
    case 'RESOLVED':
    case 'APPLIED':
    case 'POSTED':
      return 'success';
    case 'IN_PROGRESS':
    case 'CHECKED_IN':
    case 'DISPATCHED':
    case 'PICKED_UP':
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
    case 'ASSIGNED':
    case 'ANALYZED':
    case 'REVIEWING':
      return 'info';
    case 'ON_HOLD':
    case 'DOCUMENTS_PENDING':
    case 'PARTIALLY_PAID':
    case 'REQUESTED':
    case 'SCHEDULED':
    case 'SUGGESTED':
    case 'OPEN':
      return 'warning';
    case 'CANCELLED':
    case 'REJECTED':
    case 'NO_SHOW':
    case 'FAILED':
    case 'OVERPAID':
    case 'REVERSED':
      return 'danger';
    case 'DRAFT':
    case 'UPLOADED':
    case 'IGNORED_WITH_REASON':
      return 'default';
    default:
      return 'outline';
  }
}

export function severityVariant(severity: string | null | undefined): BadgeProps['variant'] {
  switch (severity) {
    case 'ERROR': return 'danger';
    case 'WARNING': return 'warning';
    case 'INFO': return 'info';
    default: return 'default';
  }
}

export { badgeVariants };
