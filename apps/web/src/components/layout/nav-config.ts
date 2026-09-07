import {
  Building2, CalendarClock, CarFront, ClipboardList, Database, FileSpreadsheet,
  FileWarning, Gauge, Globe2, Hotel, KeyRound, LayoutDashboard, MapPin,
  Link2, Receipt, Scale, Settings, ShieldCheck, Ship, Sparkles, Truck, UserCog,
  Users, UtensilsCrossed, Wallet, type LucideIcon,
} from 'lucide-react';
import { PERMISSIONS } from '@elbakri/shared';
import type { Dictionary } from '@/i18n/dictionaries/en';

export interface NavItem {
  href: string;
  icon: LucideIcon;
  /** Resolves the label from the dictionary, so nothing is hard-coded in English. */
  label: (t: Dictionary) => string;
  /** The item is shown only when the user holds at least one of these. */
  permissions?: string[];
  /** Marks the item active for nested routes too. */
  matchPrefix?: boolean;
}

export interface NavSection {
  key: string;
  label?: (t: Dictionary) => string;
  items: NavItem[];
}

/**
 * The sidebar.
 *
 * Visibility is permission-aware so the navigation reflects what a person can
 * actually do — a transfer coordinator does not see Finance at all. The API
 * enforces the same permissions independently; hiding a link is a courtesy,
 * not a security boundary.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'root',
    items: [
      {
        href: '/dashboard',
        icon: LayoutDashboard,
        label: (t) => t.nav.dashboard,
        permissions: [PERMISSIONS.TRIPS_READ],
      },
    ],
  },
  {
    key: 'operations',
    label: (t) => t.nav.operations,
    items: [
      {
        href: '/operations',
        icon: CalendarClock,
        label: (t) => t.nav.todaysOperations,
        permissions: [PERMISSIONS.TRIPS_READ],
      },
      {
        href: '/trips',
        icon: ClipboardList,
        label: (t) => t.nav.tripFiles,
        permissions: [PERMISSIONS.TRIPS_READ],
        matchPrefix: true,
      },
      {
        href: '/hotel-bookings',
        icon: Hotel,
        label: (t) => t.nav.hotelBookings,
        permissions: [PERMISSIONS.HOTELS_READ],
        matchPrefix: true,
      },
      {
        href: '/transfers',
        icon: CarFront,
        label: (t) => t.nav.transfers,
        permissions: [PERMISSIONS.TRANSFERS_READ],
        matchPrefix: true,
      },
      {
        href: '/excursions',
        icon: Ship,
        label: (t) => t.nav.excursions,
        permissions: [PERMISSIONS.EXCURSIONS_READ],
        matchPrefix: true,
      },
      {
        href: '/visas',
        icon: Globe2,
        label: (t) => t.nav.visas,
        permissions: [PERMISSIONS.VISAS_READ],
        matchPrefix: true,
      },
    ],
  },
  {
    key: 'finance',
    label: (t) => t.nav.finance,
    items: [
      {
        href: '/finance',
        icon: Gauge,
        label: (t) => t.nav.financeOverview,
        permissions: [PERMISSIONS.FINANCE_READ],
      },
      {
        href: '/finance/payables',
        icon: Receipt,
        label: (t) => t.nav.payables,
        permissions: [PERMISSIONS.FINANCE_READ],
        matchPrefix: true,
      },
      {
        href: '/finance/payments',
        icon: Wallet,
        label: (t) => t.nav.payments,
        permissions: [PERMISSIONS.FINANCE_READ],
      },
      {
        href: '/finance/settlements',
        icon: Scale,
        label: (t) => t.nav.settlements,
        permissions: [PERMISSIONS.FINANCE_READ],
      },
      {
        href: '/finance/reconciliation',
        icon: FileWarning,
        label: (t) => t.nav.reconciliation,
        permissions: [PERMISSIONS.FINANCE_RECONCILE],
      },
    ],
  },
  {
    key: 'masterData',
    label: (t) => t.nav.masterData,
    items: [
      {
        href: '/travelers',
        icon: Users,
        label: (t) => t.nav.travelers,
        permissions: [PERMISSIONS.TRAVELERS_READ],
        matchPrefix: true,
      },
      {
        href: '/master-data/hotels',
        icon: Building2,
        label: (t) => t.nav.hotels,
        permissions: [PERMISSIONS.MASTER_DATA_READ],
      },
      {
        href: '/master-data/partners',
        icon: Sparkles,
        label: (t) => t.nav.partners,
        permissions: [PERMISSIONS.MASTER_DATA_READ],
      },
      {
        href: '/master-data/excursions',
        icon: Ship,
        label: (t) => t.nav.excursionCatalog,
        permissions: [PERMISSIONS.MASTER_DATA_READ],
      },
      {
        href: '/master-data/locations',
        icon: MapPin,
        label: (t) => t.nav.locations,
        permissions: [PERMISSIONS.MASTER_DATA_READ],
      },
      {
        href: '/master-data/room-types',
        icon: Hotel,
        label: (t) => t.nav.roomTypes,
        permissions: [PERMISSIONS.MASTER_DATA_READ],
      },
      {
        href: '/master-data/meal-plans',
        icon: UtensilsCrossed,
        label: (t) => t.nav.mealPlans,
        permissions: [PERMISSIONS.MASTER_DATA_READ],
      },
      {
        href: '/master-data/drivers',
        icon: UserCog,
        label: (t) => t.nav.drivers,
        permissions: [PERMISSIONS.MASTER_DATA_READ],
      },
      {
        href: '/master-data/vehicles',
        icon: Truck,
        label: (t) => t.nav.vehicles,
        permissions: [PERMISSIONS.MASTER_DATA_READ],
      },
    ],
  },
  {
    key: 'data',
    label: (t) => t.nav.data,
    items: [
      {
        href: '/imports',
        icon: Database,
        label: (t) => t.nav.importCenter,
        permissions: [PERMISSIONS.IMPORTS_REVIEW, PERMISSIONS.IMPORTS_UPLOAD],
        matchPrefix: true,
      },
      {
        href: '/matching',
        icon: Link2,
        label: (t) => t.imports.steps.matching,
        permissions: [PERMISSIONS.MASTER_DATA_READ],
      },
      {
        href: '/data-quality',
        icon: FileWarning,
        label: (t) => t.nav.dataQuality,
        permissions: [PERMISSIONS.DATA_QUALITY_READ],
        matchPrefix: true,
      },
      {
        href: '/reports',
        icon: FileSpreadsheet,
        label: (t) => t.nav.reports,
        permissions: [PERMISSIONS.REPORTS_EXPORT],
      },
    ],
  },
  {
    key: 'administration',
    label: (t) => t.nav.administration,
    items: [
      {
        href: '/admin/users',
        icon: ShieldCheck,
        label: (t) => t.nav.users,
        permissions: [PERMISSIONS.USERS_READ],
        matchPrefix: true,
      },
      {
        href: '/admin/audit',
        icon: ClipboardList,
        label: (t) => t.nav.auditLog,
        permissions: [PERMISSIONS.AUDIT_READ],
      },
      {
        href: '/admin/api-keys',
        icon: KeyRound,
        label: (t) => t.nav.apiIntegrations,
        permissions: [PERMISSIONS.API_KEYS_CREATE, PERMISSIONS.API_KEYS_MANAGE],
      },
      {
        href: '/admin/settings',
        icon: Settings,
        label: (t) => t.nav.settings,
        permissions: [PERMISSIONS.SETTINGS_MANAGE],
      },
    ],
  },
];

/** Filters the navigation down to what this user can reach. */
export function visibleSections(
  canAny: (...permissions: string[]) => boolean,
): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permissions || canAny(...item.permissions)),
  })).filter((section) => section.items.length > 0);
}

export function isActive(pathname: string, item: NavItem): boolean {
  const path = pathname.replace(/^\/(en|ar)(?=\/|$)/, '') || '/';
  if (item.matchPrefix) return path === item.href || path.startsWith(`${item.href}/`);
  return path === item.href;
}
