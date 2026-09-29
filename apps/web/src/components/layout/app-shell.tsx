'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CarFront, FileBadge, Hotel, LogOut, Menu as MenuIcon, Moon, Plus, ShoppingBag, Sun, TentTree, UserRound, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useI18n, useSession, useTheme } from '@/lib/providers';
import { LOCALE_META, LOCALES } from '@/i18n/config';
import { cn, initials } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { BrandLogo } from './brand-logo';
import { GlobalSearch } from './global-search';
import { NAV, isActive } from './nav';

type OpenCounts = Record<'HOTEL' | 'TRANSFER' | 'EXCURSION' | 'VISA' | 'SALE', number>;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const { theme, toggle } = useTheme();
  const { user, loading, signOut, is } = useSession();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  const counts = useQuery({
    queryKey: ['/dashboard', 'open-counts'],
    queryFn: () => api.get<OpenCounts>('/dashboard/open-counts'),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });

  if (loading || !user) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <BrandLogo className="h-10 opacity-70" priority />
          <span className="text-xs text-muted-foreground">{t.common.loading}</span>
        </div>
      </div>
    );
  }

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || is(...i.roles)) })).filter((g) => g.items.length);

  const nav = (
    <nav className="scroll-thin flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label={t.nav.operations}>
      {groups.map((group) => (
        <div key={group.key}>
          {group.label ? (
            <p className="px-2.5 pb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-white/40">{group.label(t)}</p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              const badge = item.badge ? counts.data?.[item.badge] ?? 0 : 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[0.9rem] transition-colors',
                      active ? 'bg-white/[0.12] font-medium text-white' : 'text-white/70 hover:bg-white/[0.07] hover:text-white',
                    )}
                  >
                    {active ? <span className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-sun" aria-hidden /> : null}
                    <Icon className="size-[18px] shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{item.label(t)}</span>
                    {badge > 0 ? (
                      <span
                        className="tabular rounded-full bg-sun px-1.5 text-[0.68rem] font-semibold leading-5 text-brand-950"
                        title={t.dashboard.openRequests}
                      >
                        {badge > 99 ? '99+' : badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const sidebar = (
    <>
      <div className="flex h-topbar shrink-0 items-center border-b border-white/10 px-5">
        <Link href="/dashboard" aria-label={t.common.appName}>
          <BrandLogo variant="light" className="h-7" priority />
        </Link>
      </div>
      {nav}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white">
            {initials(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-[0.7rem] text-white/50">{t.roles[user.role]}</p>
          </div>
        </div>
      </div>
    </>
  );

  const newItems = [
    { href: '/sales/new', icon: ShoppingBag, label: t.dashboard.newSale, show: is('SALES') },
    { href: '/hotels?new=1', icon: Hotel, label: t.dashboard.newHotel, show: true },
    { href: '/transfers?new=1', icon: CarFront, label: t.dashboard.newTransfer, show: true },
    { href: '/excursions?new=1', icon: TentTree, label: t.dashboard.newExcursion, show: true },
    { href: '/visas?new=1', icon: FileBadge, label: t.dashboard.newVisa, show: true },
  ].filter((i) => i.show);

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="sticky top-0 hidden h-dvh w-sidebar shrink-0 flex-col bg-brand-900 lg:flex">{sidebar}</aside>

      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-brand-950/60 animate-fade-in" onClick={() => setDrawer(false)} aria-label={t.common.close} />
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-brand-900 shadow-overlay animate-slide-in-end ltr:[--slide-from:-100%] rtl:[--slide-from:100%]">
            <button
              type="button"
              onClick={() => setDrawer(false)}
              className="absolute end-2 top-3 rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
              aria-label={t.common.close}
            >
              <X className="size-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-topbar shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md sm:px-5">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setDrawer(true)} aria-label={t.nav.openMenu}>
            <MenuIcon className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <GlobalSearch />
          </div>

          <Menu>
            <MenuTrigger asChild>
              <Button variant="sun" size="sm" className="h-9 px-3">
                <Plus />
                <span className="hidden sm:inline">{t.dashboard.quick}</span>
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuLabel>{t.dashboard.quick}</MenuLabel>
              {newItems.map((item) => (
                <MenuItem key={item.href} onSelect={() => router.push(item.href)}>
                  <item.icon className="text-muted-foreground" />
                  {item.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>

          <div className="hidden items-center rounded-lg bg-surface-sunken p-0.5 sm:flex">
            {LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLocale(code)}
                aria-pressed={locale === code}
                className={cn(
                  'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  locale === code ? 'bg-surface text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {LOCALE_META[code].nativeLabel}
              </button>
            ))}
          </div>

          <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={t.nav.theme} title={t.nav.theme}>
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>

          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-full bg-primary text-[0.7rem] font-semibold text-primary-foreground ring-offset-2 ring-offset-background hover:ring-2 hover:ring-ring/30"
                aria-label={user.name}
              >
                {initials(user.name)}
              </button>
            </MenuTrigger>
            <MenuContent className="w-56">
              <div className="px-2.5 py-2">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <MenuSeparator />
              <MenuItem onSelect={() => router.push('/settings?tab=account')}>
                <UserRound className="text-muted-foreground" />
                {t.nav.account}
              </MenuItem>
              <MenuItem className="sm:hidden" onSelect={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
                <span className="w-4 text-center text-xs">{locale === 'ar' ? 'En' : 'ع'}</span>
                {locale === 'ar' ? LOCALE_META.en.nativeLabel : LOCALE_META.ar.nativeLabel}
              </MenuItem>
              <MenuSeparator />
              <MenuItem destructive onSelect={() => void signOut()}>
                <LogOut className="flip-rtl" />
                {t.nav.signOut}
              </MenuItem>
            </MenuContent>
          </Menu>
        </header>

        <main className="paper min-w-0 flex-1 px-3 pb-10 pt-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

/** Title row at the top of every page. */
export function PageHeader({
  title,
  subtitle,
  actions,
  icon: Icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 animate-rise">
      <div className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Icon className="size-5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="truncate text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
