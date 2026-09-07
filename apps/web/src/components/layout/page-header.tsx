import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PageGuideButton } from '@/components/help/page-guide';

/**
 * Consistent page heading: title, description, actions, and — where the screen
 * has a guide registered — the help control that explains it.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  guideKey,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  /** Key into the help registry; renders the page guide button when present. */
  guideKey?: string;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 space-y-2', className)}>
      {breadcrumb ? <div className="text-xs text-muted-foreground">{breadcrumb}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">{title}</h1>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
          {guideKey ? <PageGuideButton guideKey={guideKey} /> : null}
        </div>
      </div>
    </div>
  );
}
