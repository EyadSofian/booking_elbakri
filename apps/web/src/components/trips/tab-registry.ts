import {
  CarFront, Globe2, History, Hotel, LayoutDashboard,
  Paperclip, Receipt, Ship, Users,
} from 'lucide-react';
import { PERMISSIONS } from '@elbakri/shared';
import type { TabDefinition } from '@/components/layout/tabs';
import type { TripTabContext } from './types';
import { OverviewTab } from './tabs/overview-tab';
import { TravelersTab } from './tabs/travelers-tab';
import { HotelsTab } from './tabs/hotels-tab';
import { TransfersTab } from './tabs/transfers-tab';
import { ExcursionsTab } from './tabs/excursions-tab';
import { VisaTab } from './tabs/visa-tab';
import { FinanceTab } from './tabs/finance-tab';
import { AttachmentsTab } from './tabs/attachments-tab';
import { TimelineTab } from './tabs/timeline-tab';

/**
 * The Trip File tabs, declared once.
 *
 * Everything a tab needs — its URL value, label, icon, permission, count and
 * help — lives in this one place, so the tab bar, the permission check and the
 * help text cannot drift apart across separate files.
 *
 * Note there are no feature flags here. These are core modules: if a user holds
 * the permission the tab works. Permission decides security; it is not a
 * rollout switch.
 */
export const TRIP_TABS: TabDefinition<TripTabContext>[] = [
  {
    key: 'overview',
    label: (t) => t.trips.overview,
    icon: LayoutDashboard,
    content: OverviewTab,
  },
  {
    key: 'travelers',
    label: (t) => t.trips.travelers,
    icon: Users,
    count: (c) => c.trip.travelers.length,
    content: TravelersTab,
  },
  {
    key: 'hotels',
    label: (t) => t.trips.hotels,
    icon: Hotel,
    permissions: [PERMISSIONS.HOTELS_READ],
    count: (c) => c.trip.hotelBookings.length,
    content: HotelsTab,
  },
  {
    key: 'transfers',
    label: (t) => t.trips.transfers,
    icon: CarFront,
    permissions: [PERMISSIONS.TRANSFERS_READ],
    count: (c) => c.trip.transferBookings.length,
    content: TransfersTab,
  },
  {
    key: 'excursions',
    label: (t) => t.trips.excursions,
    icon: Ship,
    permissions: [PERMISSIONS.EXCURSIONS_READ],
    count: (c) => c.trip.excursionBookings.length,
    content: ExcursionsTab,
  },
  {
    key: 'visa',
    label: (t) => t.trips.visa,
    icon: Globe2,
    permissions: [PERMISSIONS.VISAS_READ],
    count: (c) => c.trip.visaOrders.length,
    content: VisaTab,
  },
  {
    key: 'finance',
    label: (t) => t.trips.finance,
    icon: Receipt,
    permissions: [PERMISSIONS.FINANCE_READ],
    count: (c) => c.trip.financialDocuments.length,
    helpKey: 'field.outstanding',
    content: FinanceTab,
  },
  {
    key: 'attachments',
    label: (t) => t.trips.attachments,
    icon: Paperclip,
    count: (c) => c.trip.attachments.length,
    content: AttachmentsTab,
  },
  {
    key: 'timeline',
    label: (t) => t.trips.timeline,
    icon: History,
    content: TimelineTab,
  },
];
