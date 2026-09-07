import { resolveActiveTab, visibleTabs, type TabLike } from './tab-routing';

const TABS: TabLike[] = [
  { key: 'overview' },
  { key: 'hotels', permissions: ['hotels.read'] },
  { key: 'finance', permissions: ['finance.read'] },
  { key: 'preview', disabled: true },
];

const allows = (...granted: string[]) =>
  (...needed: string[]) => needed.every((p) => granted.includes(p));

describe('tab visibility', () => {
  it('hides a tab the user has no permission for', () => {
    const visible = visibleTabs(TABS, allows('hotels.read'));
    expect(visible.map((t) => t.key)).toEqual(['overview', 'hotels', 'preview']);
  });

  it('shows a tab once the permission is granted', () => {
    const visible = visibleTabs(TABS, allows('hotels.read', 'finance.read'));
    expect(visible.map((t) => t.key)).toContain('finance');
  });

  it('always shows tabs that need no permission', () => {
    expect(visibleTabs(TABS, allows()).map((t) => t.key)).toEqual(['overview', 'preview']);
  });
});

describe('resolving the active tab from the URL', () => {
  const visible = visibleTabs(TABS, allows('hotels.read'));

  it('honours a valid tab value', () => {
    expect(resolveActiveTab(visible, 'hotels')?.key).toBe('hotels');
  });

  it('falls back to the first usable tab when none is given', () => {
    expect(resolveActiveTab(visible, null)?.key).toBe('overview');
  });

  it('falls back rather than showing nothing for an unknown tab', () => {
    expect(resolveActiveTab(visible, 'nonsense')?.key).toBe('overview');
  });

  it('falls back when a bookmarked tab is no longer permitted', () => {
    // The link was shared by someone with finance access.
    expect(resolveActiveTab(visible, 'finance')?.key).toBe('overview');
  });

  it('does not land on a disabled tab by default', () => {
    const onlyDisabledFirst: TabLike[] = [{ key: 'preview', disabled: true }, { key: 'overview' }];
    expect(resolveActiveTab(onlyDisabledFirst, null)?.key).toBe('overview');
  });

  it('still honours a disabled tab when explicitly requested, so the reason shows', () => {
    expect(resolveActiveTab(visible, 'preview')?.key).toBe('preview');
  });

  it('returns nothing when there are no tabs at all', () => {
    expect(resolveActiveTab([], 'overview')).toBeUndefined();
  });
});
