/**
 * Tab resolution, independent of React.
 *
 * The rule that matters is which tab a URL resolves to — including when the
 * requested one is unknown, forbidden or unavailable. Keeping it here means it
 * can be tested directly rather than through a rendered component.
 */

export interface TabLike {
  key: string;
  permissions?: string[];
  disabled?: boolean;
}

/** The tabs this user may see. Permission decides visibility, not availability. */
export function visibleTabs<T extends TabLike>(
  tabs: T[],
  hasPermissions: (...permissions: string[]) => boolean,
): T[] {
  return tabs.filter((tab) => !tab.permissions?.length || hasPermissions(...tab.permissions));
}

/**
 * Which tab a `?tab=` value resolves to.
 *
 * An unknown or now-forbidden value falls back to the first usable tab rather
 * than rendering nothing, so a stale bookmark or a permission change still
 * opens a working page.
 */
export function resolveActiveTab<T extends TabLike>(
  tabs: T[],
  requested: string | null | undefined,
): T | undefined {
  const match = tabs.find((tab) => tab.key === requested);
  if (match) return match;
  return tabs.find((tab) => !tab.disabled) ?? tabs[0];
}
