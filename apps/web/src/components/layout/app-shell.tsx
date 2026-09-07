'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Bell, ChevronLeft, ChevronRight, LogOut, Menu, Moon, Search, Sun, User as UserIcon, X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { LOCALE_META, LOCALES, type Locale } from '@/i18n/config';
import { BrandLogo, BrandMark } from './brand-logo';
import { isActive, visibleSections } from './nav-config';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CommandPalette } from './command-palette';

const SIDEBAR_KEY = 'elbakri.sidebarCollapsed';
const THEME_KEY = 'elbakri.theme';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, locale, dir, setLocale } = useI18n();
  const { user, loading, canAny, signOut } = useSession();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Restore the operator's own preferences. These are per-device conveniences,
  // so localStorage is the right home for them and a failure is harmless.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === 'true');
      const saved = window.localStorage.getItem(THEME_KEY);
      const next = saved === 'dark' || saved === 'light'
        ? saved
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
      setTheme(next);
      document.documentElement.dataset.theme = next;
    } catch {
      /* storage unavailable */
    }
  }, []);

  // The navigation drawer must not survive a route change on mobile.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(SIDEBAR_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    enabled: Boolean(user),
    refetchInterval: 120_000,
  });

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <BrandLogo className="h-10 opacity-60" priority />
          <span className="text-xs text-muted-foreground">{t.common.loading}</span>
        </div>
      </div>
    );
  }
  if (!user) return null;

  const sections = visibleSections(canAny);
  const ChevronCollapse = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const ChevronExpand = dir === 'rtl' ? ChevronLeft : ChevronRight;

  const sidebarContent = (
    <>
      <div
        className={cn(
          'flex h-topbar shrink-0 items-center gap-2 border-b border-white/10 px-3',
          collapsed && 'justify-center px-2',
        )}
      >
        {collapsed ? (
          <BrandMark />
        ) : (
          // The mark sits on the navy sidebar, so the white artwork is used —
          // the surface is what changes, never the logo.
          <BrandLogo variant="light" className="h-7" priority />
        )}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3" aria-label={t.nav.operations}>
        {sections.map((section) => (
          <div key={section.key}>
            {section.label && !collapsed ? (
              <p className="px-2 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-white/45">
                {section.label(t)}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label(t) : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                        collapsed && 'justify-center px-0',
                        active
                          ? 'bg-white/15 font-medium text-white'
                          : 'text-white/70 hover:bg-white/10 hover:text-white',
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {!collapsed ? <span className="truncate">{item.label(t)}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-2">
        <button
          type="button"
          onClick={toggleSidebar}
          className={cn(
            'hidden w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-white/60',
            'transition-colors hover:bg-white/10 hover:text-white lg:flex',
            collapsed && 'justify-center',
          )}
          aria-label={collapsed ? t.nav.expandSidebar : t.nav.collapseSidebar}
        >
          {collapsed ? (
            <ChevronExpand className="size-4" aria-hidden />
          ) : (
            <>
              <ChevronCollapse className="size-4" aria-hidden />
              <span>{t.nav.collapseSidebar}</span>
            </>
          )}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col bg-brand-900 lg:flex',
          'transition-[width] duration-200',
          collapsed ? 'w-sidebar-collapsed' : 'w-sidebar',
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile drawer — slides from the inline-start edge, so it mirrors in RTL */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-brand-950/60 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-label={t.common.close}
          />
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-brand-900 shadow-overlay">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute end-2 top-3 rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
              aria-label={t.common.close}
            >
              <X className="size-4" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-topbar shrink-0 items-center gap-2 border-b bg-surface/95 px-3 backdrop-blur sm:px-4">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label={t.nav.openMenu}
          >
            <Menu className="size-5" />
          </Button>

          <div className="flex items-center lg:hidden">
            <BrandLogo className="h-6" />
          </div>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className={cn(
              'ms-auto flex h-8 items-center gap-2 rounded-md border border-input bg-surface-muted px-2.5',
              'text-xs text-muted-foreground transition-colors hover:bg-accent lg:ms-0 lg:w-80',
            )}
          >
            <Search className="size-3.5 shrink-0" aria-hidden />
            <span className="hidden truncate lg:inline">{t.common.searchPlaceholder}</span>
            <kbd className="ms-auto hidden rounded border bg-surface px-1 py-0.5 font-mono text-2xs lg:inline">
              ⌘K
            </kbd>
          </button>

          <div className="ms-auto flex items-center gap-1">
            <div className="hidden items-center rounded-md border bg-surface-muted p-0.5 sm:flex">
              {LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLocale(code as Locale)}
                  className={cn(
                    'rounded px-2 py-1 text-xs font-medium transition-colors',
                    locale === code
                      ? 'bg-surface text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-pressed={locale === code}
                >
                  {LOCALE_META[code as Locale].nativeLabel}
                </button>
              ))}
            </div>

            <Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label="Theme">
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>

            <Button variant="ghost" size="icon-sm" asChild aria-label={t.nav.dashboard}>
              <Link href="/notifications" className="relative">
                <Bell className="size-4" />
                {unread && unread.count > 0 ? (
                  <Badge
                    variant="danger"
                    className="absolute -end-1 -top-1 min-w-4 justify-center px-1 py-0 text-[10px]"
                  >
                    {unread.count > 99 ? '99+' : unread.count}
                  </Badge>
                ) : null}
              </Link>
            </Button>

            <div className="group relative">
              <button
                type="button"
                className="flex h-8 items-center gap-2 rounded-md px-2 text-xs hover:bg-accent"
              >
                <span className="grid size-6 place-items-center rounded-full bg-brand-800 text-2xs font-semibold text-white">
                  {user.fullName.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-32 truncate sm:inline">{user.fullName}</span>
              </button>
              <div
                className={cn(
                  'invisible absolute end-0 top-full z-40 mt-1 w-52 rounded-md border bg-popover p-1',
                  'opacity-0 shadow-overlay transition-all group-hover:visible group-hover:opacity-100',
                  'focus-within:visible focus-within:opacity-100',
                )}
              >
                <div className="border-b px-2 py-2">
                  <p className="truncate text-xs font-medium">{user.fullName}</p>
                  <p className="truncate text-2xs text-muted-foreground">{user.email}</p>
                </div>
                <Link
                  href="/account"
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent"
                >
                  <UserIcon className="size-3.5" aria-hidden />
                  {t.auth.myAccount}
                </Link>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="size-3.5 flip-rtl" aria-hidden />
                  {t.auth.signOut}
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 py-4 sm:px-4 lg:px-6">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
