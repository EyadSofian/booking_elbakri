'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { HelpCircle, X } from 'lucide-react';
import { useI18n } from '@/lib/providers';
import { pageGuide } from '@/lib/help-registry';
import { cn } from '@/lib/utils';

/**
 * The page-level guide: a `?` button that opens an explanation of the screen.
 *
 * A side drawer on desktop, a bottom sheet on phones — and in Arabic it opens
 * from the other edge, because a drawer that always slides from the right
 * fights the reading direction.
 */
export function PageGuideButton({ guideKey }: { guideKey: string }) {
  const { t, locale, dir } = useI18n();
  const guide = pageGuide(guideKey);
  if (!guide) return null;

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={`${t.common.more}: ${guide.title[locale]}`}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-surface px-2.5',
            'text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <HelpCircle className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">{t.common.more}</span>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-brand-950/50 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <Dialog.Content
          dir={dir}
          className={cn(
            // Bottom sheet on phones; an edge drawer from the inline-end side
            // on larger screens, so it mirrors correctly in Arabic.
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-lg border bg-surface',
            'shadow-overlay data-[state=open]:animate-fade-in',
            'sm:inset-y-0 sm:end-0 sm:start-auto sm:max-h-none sm:w-[26rem] sm:rounded-none sm:border-s',
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4">
            <div>
              <Dialog.Title className="text-base font-semibold">
                {guide.title[locale]}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {guide.summary[locale]}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="shrink-0 rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label={t.common.close}
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="space-y-5">
              {guide.sections.map((section) => (
                <section key={section.heading.en}>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.heading[locale]}
                  </h3>
                  <ul className="space-y-1.5">
                    {section.body[locale].map((line, i) => (
                      <li key={i} className="flex gap-2 text-xs leading-relaxed">
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
