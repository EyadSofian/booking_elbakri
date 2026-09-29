'use client';

import * as React from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { useI18n } from '@/lib/providers';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function EmptyState({
  title,
  hint,
  action,
  className,
  icon: Icon = Inbox,
}: {
  title?: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const { t } = useI18n();
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-4 py-12 text-center', className)}>
      <span className="grid size-11 place-items-center rounded-full bg-surface-sunken text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium">{title ?? t.common.noResults}</p>
      {hint !== null ? <p className="max-w-sm text-xs text-muted-foreground">{hint ?? t.common.noResultsHint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, errorMessage } = useI18n();
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-danger-subtle text-danger">
        <AlertTriangle className="size-5" />
      </span>
      <p className="text-sm font-medium">{t.common.error}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{errorMessage(error)}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          {t.common.retry}
        </Button>
      ) : null}
    </div>
  );
}

/** Placeholder rows while a list loads, so the layout does not jump. */
export function RowsSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((__, c) => (
            <div
              key={c}
              className="h-3 animate-pulse rounded bg-surface-sunken"
              style={{ width: `${c === 0 ? 14 : 8 + ((r * 7 + c * 13) % 10)}%`, animationDelay: `${(r + c) * 40}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** "Are you sure?" before anything that cannot be undone from the screen. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  destructive = true,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  body?: React.ReactNode;
  confirmLabel: React.ReactNode;
  onConfirm: () => void;
  destructive?: boolean;
  busy?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" closeLabel={t.common.close}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {body ? <DialogDescription>{body}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody className="py-2" />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
