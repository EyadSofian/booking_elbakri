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

/** The whole app in eight places. */
export const NAV: NavGroup[] = [
  { key: 'home', items: [{ href: '/dashboard', icon: Home, label: (t) => t.nav.home }] },
  {
    key: 'sales',
    items: [{ href: '/sales', icon: ShoppingBag, label: (t) => t.nav.sales, badge: 'SALE' }],
  },
  {
    key: 'operations',
    label: (t) => t.nav.operations,
    items: [
      { href: '/hotels', icon: Hotel, label: (t) => t.nav.hotels, badge: 'HOTEL' },
      { href: '/transfers', icon: CarFront, label: (t) => t.nav.transfers, badge: 'TRANSFER' },
      { href: '/excursions', icon: TentTree, label: (t) => t.nav.excursions, badge: 'EXCURSION' },
      { href: '/visas', icon: FileBadge, label: (t) => t.nav.visas, badge: 'VISA' },
    ],
  },
  {
    key: 'office',
    items: [
      { href: '/reports', icon: BarChart3, label: (t) => t.nav.reports },
      { href: '/settings', icon: Settings, label: (t) => t.nav.settings },
    ],
  },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
