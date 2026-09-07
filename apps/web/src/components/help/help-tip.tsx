'use client';

import * as Popover from '@radix-ui/react-popover';
import { HelpCircle, Info } from 'lucide-react';
import { useI18n } from '@/lib/providers';
import { helpText, noticeText } from '@/lib/help-registry';
import { cn } from '@/lib/utils';

/**
 * A small help control beside a field or label.
 *
 * Deliberately a button in a popover rather than a hover tooltip: hover is
 * unreachable by keyboard, invisible to screen readers and does not exist on a
 * phone. Everyone gets the same explanation the same way.
 */
export function HelpTip({
  helpKey,
  text,
  label,
  className,
  side = 'top',
}: {
  /** Key into the help registry. Ignored when `text` is given. */
  helpKey?: string;
  /** Literal text, for reasons computed at runtime (e.g. why a tab is disabled). */
  text?: string;
  /** What the help is about, for the accessible name. */
  label?: string;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  const { t, locale, dir } = useI18n();
  const content = text ?? (helpKey ? helpText(helpKey, locale) : null);
  if (!content) return null;

  const accessibleName = label
    ? `${t.common.more}: ${label}`
    : t.common.more;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={accessibleName}
          className={cn(
            'inline-flex size-4 shrink-0 items-center justify-center rounded-full align-middle',
            'text-muted-foreground/70 transition-colors hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
        >
          <HelpCircle className="size-3.5" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side}
          align="center"
          sideOffset={6}
          collisionPadding={12}
          dir={dir}
          className={cn(
            'z-50 max-w-xs rounded-md border bg-popover px-3 py-2 text-xs leading-relaxed',
            'text-popover-foreground shadow-overlay data-[state=open]:animate-fade-in',
          )}
        >
          {content}
          <Popover.Arrow className="fill-popover" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * A compact inline notice for a rule that would otherwise be misunderstood.
 *
 * Used sparingly — a notice on every screen is a notice nobody reads.
 */
export function HelpNotice({
  noticeKey,
  text,
  tone = 'info',
  className,
}: {
  noticeKey?: string;
  text?: string;
  tone?: 'info' | 'warning';
  className?: string;
}) {
  const { locale } = useI18n();
  const content = text ?? (noticeKey ? noticeText(noticeKey, locale) : null);
  if (!content) return null;

  return (
    <div
      className={cn(
        'mb-3 flex items-start gap-2 rounded-md px-3 py-2 text-2xs leading-relaxed',
        tone === 'warning'
          ? 'bg-warning-subtle text-warning'
          : 'border bg-surface-muted text-muted-foreground',
        className,
      )}
    >
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{content}</span>
    </div>
  );
}

/**
 * Explains why a control cannot be used, next to the control itself.
 *
 * A disabled button with no explanation is a dead end; the user cannot tell
 * whether it is broken, forbidden, or waiting on something they could do.
 */
export function DisabledReason({ reason, className }: { reason: string | null; className?: string }) {
  if (!reason) return null;
  return <HelpTip text={reason} className={className} />;
}
