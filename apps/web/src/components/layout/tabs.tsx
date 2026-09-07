'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, type ComponentType, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { resolveActiveTab, visibleTabs } from '@elbakri/shared';
import { cn } from '@/lib/utils';
import { useI18n, useSession } from '@/lib/providers';
import type { Dictionary } from '@/i18n/dictionaries/en';
import { HelpTip } from '@/components/help/help-tip';

/**
 * One tab in a URL-backed tab set.
 *
 * A tab describes itself completely — label, icon, permission, help, when it is
 * available and what it renders — so the sidebar, the tab bar, permissions and
 * help text cannot drift apart across separate files.
 */
export interface TabDefinition<TContext = unknown> {
  /** URL value, e.g. `overview` in `?tab=overview`. Stable; never translated. */
  key: string;
  label: (t: Dictionary) => string;
  icon?: LucideIcon;
  /** Hidden entirely unless the user holds every listed permission. */
  permissions?: string[];
  /** Badge count shown beside the label. */
  count?: (ctx: TContext) => number | undefined;
  /** Key into the help registry, rendered as an info control on the tab. */
  helpKey?: string;
  /**
   * Why this tab cannot be used yet, given the record's state. Returning a
   * reason renders the tab disabled *with that explanation* rather than as a
   * control that silently does nothing.
   *
   * Receives the dictionary because the reason is shown to the user and must
   * be localised like everything else.
   */
  unavailable?: (ctx: TContext, t: Dictionary) => string | null;
  content: ComponentType<{ context: TContext }>;
}

export interface ResolvedTab<TContext> extends TabDefinition<TContext> {
  disabledReason: string | null;
  countValue: number | undefined;
}

/**
 * Filters a tab set to what this user may see, and resolves per-record state.
 *
 * Permission decides visibility — a tab the user cannot access is not rendered
 * at all. Workflow state decides availability — a visible tab may still be
 * disabled, but it always says why.
 */
export function useResolvedTabs<TContext>(
  definitions: TabDefinition<TContext>[],
  context: TContext,
  /**
   * Whether the record has loaded.
   *
   * Hooks cannot be called conditionally, so this hook runs before the query
   * resolves. `count` and `unavailable` read the record, so asking them about
   * a record that does not exist yet would throw and take the page down. While
   * loading the tabs resolve without those values — which are not on screen
   * anyway, because the page is showing a skeleton.
   */
  ready = true,
): ResolvedTab<TContext>[] {
  const { can } = useSession();
  const { t } = useI18n();
  return useMemo(
    () =>
      // visibleTabs holds the permission rule and is unit tested directly.
      visibleTabs(definitions, can).map((tab) => ({
        ...tab,
        disabledReason: ready ? tab.unavailable?.(context, t) ?? null : null,
        countValue: ready ? tab.count?.(context) : undefined,
      })),
    [definitions, context, can, t, ready],
  );
}

/**
 * Reads and writes the active tab in the query string.
 *
 * The URL is the source of truth, not React state: a refresh, a shared link and
 * the browser's Back button all have to land on the same tab, and local state
 * loses all three.
 */
export function useActiveTab<TContext>(
  tabs: ResolvedTab<TContext>[],
  param = 'tab',
): {
  active: ResolvedTab<TContext> | undefined;
  activeKey: string | undefined;
  setTab: (key: string) => void;
} {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get(param);

  // An unknown or now-forbidden tab falls back to the first one available, so a
  // stale bookmark still opens a working page. The rule lives in the shared
  // package and is unit tested there.
  const active = useMemo(
    () =>
      resolveActiveTab(
        tabs.map((tab) => ({ ...tab, disabled: Boolean(tab.disabledReason) })),
        requested,
      ) as ResolvedTab<TContext> | undefined,
    [tabs, requested],
  );

  const setTab = useCallback(
    (key: string) => {
      const next = new URLSearchParams(params.toString());
      next.set(param, key);
      // push, not replace: switching tabs is navigation, and Back should undo it.
      router.push(`?${next.toString()}`, { scroll: false });
    },
    [params, router, param],
  );

  return { active, activeKey: active?.key, setTab };
}

/** The tab bar. Horizontally scrollable, so a long set stays usable at 360px. */
export function TabBar<TContext>({
  tabs,
  activeKey,
  onSelect,
  className,
}: {
  tabs: ResolvedTab<TContext>[];
  activeKey: string | undefined;
  onSelect: (key: string) => void;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <div
      role="tablist"
      className={cn('mb-4 flex gap-1 overflow-x-auto border-b pb-px', className)}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        const Icon = tab.icon;
        const disabled = Boolean(tab.disabledReason);
        return (
          <div key={tab.key} className="flex shrink-0 items-center">
            <button
              type="button"
              role="tab"
              id={`tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.key}`}
              aria-disabled={disabled || undefined}
              // A disabled tab keeps its title so the reason is reachable by
              // hover, and the HelpTip beside it makes it reachable by keyboard.
              title={tab.disabledReason ?? undefined}
              onClick={() => !disabled && onSelect(tab.key)}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors',
                isActive
                  ? 'border-brand-700 text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
                disabled && 'cursor-not-allowed opacity-50 hover:text-muted-foreground',
              )}
            >
              {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
              {tab.label(t)}
              {tab.countValue !== undefined && tab.countValue > 0 ? (
                <span className="rounded bg-secondary px-1 py-0.5 text-2xs tabular-nums">
                  {tab.countValue}
                </span>
              ) : null}
            </button>

            {tab.disabledReason ? (
              <HelpTip label={tab.label(t)} text={tab.disabledReason} className="-ms-1 me-1" />
            ) : tab.helpKey && isActive ? (
              <HelpTip helpKey={tab.helpKey} className="-ms-1 me-1" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Renders the active tab's content with the right ARIA wiring. */
export function TabPanel<TContext>({
  tab,
  context,
  children,
}: {
  tab: ResolvedTab<TContext> | undefined;
  context: TContext;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  if (!tab) return null;

  if (tab.disabledReason) {
    return (
      <div
        role="tabpanel"
        id={`tabpanel-${tab.key}`}
        aria-labelledby={`tab-${tab.key}`}
        className="rounded-lg border bg-card px-6 py-12 text-center"
      >
        <p className="text-sm font-medium">{tab.label(t)}</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          {tab.disabledReason}
        </p>
      </div>
    );
  }

  const Content = tab.content;
  return (
    <div role="tabpanel" id={`tabpanel-${tab.key}`} aria-labelledby={`tab-${tab.key}`}>
      {children ?? <Content context={context} />}
    </div>
  );
}
