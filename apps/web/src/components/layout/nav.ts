import {
  BarChart3, CarFront, FileBadge, Home, Hotel, Settings, ShoppingBag, TentTree, type LucideIcon,
} from 'lucide-react';
import type { Role } from '@elbakri/shared';
import type { Dictionary } from '@/i18n/dictionaries/en';

export interface NavItem {
  href: string;
  icon: LucideIcon;
  label: (t: Dictionary) => string;
  /** Who sees it. Admins see everything. Leave out for everyone. */
  roles?: Role[];
  /** The open-requests badge comes from this dashboard counter. */
  badge?: 'HOTEL' | 'TRANSFER' | 'EXCURSION' | 'VISA' | 'SALE';
}

export interface NavGroup {
  key: string;
  label?: (t: Dictionary) => string;
  items: NavItem[];
}

/**
 * The whole app in eight places. Salespeople see Sales only; their account is
 * under the avatar menu.
 */
export const NAV: NavGroup[] = [
  { key: 'home', items: [{ href: '/dashboard', icon: Home, label: (t) => t.nav.home, roles: ['OPERATIONS'] }] },
  {
    key: 'sales',
    items: [{ href: '/sales', icon: ShoppingBag, label: (t) => t.nav.sales, badge: 'SALE' }],
  },
  {
    key: 'operations',
    label: (t) => t.nav.operations,
    items: [
      { href: '/hotels', icon: Hotel, label: (t) => t.nav.hotels, badge: 'HOTEL', roles: ['OPERATIONS'] },
      { href: '/transfers', icon: CarFront, label: (t) => t.nav.transfers, badge: 'TRANSFER', roles: ['OPERATIONS'] },
      { href: '/excursions', icon: TentTree, label: (t) => t.nav.excursions, badge: 'EXCURSION', roles: ['OPERATIONS'] },
      { href: '/visas', icon: FileBadge, label: (t) => t.nav.visas, badge: 'VISA', roles: ['OPERATIONS'] },
    ],
  },
  {
    key: 'office',
    items: [
      { href: '/reports', icon: BarChart3, label: (t) => t.nav.reports, roles: ['ADMIN'] },
      { href: '/settings', icon: Settings, label: (t) => t.nav.settings, roles: ['OPERATIONS'] },
    ],
  },
];

/** Where a person lands: salespeople on Sales, everyone else on the dashboard. */
export function homeFor(role: Role | undefined): string {
  return role === 'SALES' ? '/sales' : '/dashboard';
}

/** Salespeople stay in Sales (plus their own account page). */
export function allowedFor(role: Role | undefined, pathname: string): boolean {
  if (role !== 'SALES') return true;
  return isActive(pathname, '/sales') || isActive(pathname, '/settings');
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
