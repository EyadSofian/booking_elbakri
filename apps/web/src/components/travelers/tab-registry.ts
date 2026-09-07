import { CarFront, Globe2, Hotel, LayoutDashboard, Ship } from 'lucide-react';
import { PERMISSIONS } from '@elbakri/shared';
import type { TabDefinition } from '@/components/layout/tabs';
import type { TravelerTabContext } from './types';
import { TravelerOverviewTab } from './tabs/overview-tab';
import {
  TravelerExcursionsTab, TravelerHotelsTab, TravelerTransfersTab, TravelerVisasTab,
} from './tabs/services-tabs';

/** Traveller detail tabs — same registry pattern as Trip Files. */
export const TRAVELER_TABS: TabDefinition<TravelerTabContext>[] = [
  {
    key: 'overview',
    label: (t) => t.trips.overview,
    icon: LayoutDashboard,
    content: TravelerOverviewTab,
  },
  {
    key: 'hotels',
    label: (t) => t.trips.hotels,
    icon: Hotel,
    permissions: [PERMISSIONS.HOTELS_READ],
    count: (c) => c.traveler.hotelBookings.length,
    content: TravelerHotelsTab,
  },
  {
    key: 'transfers',
    label: (t) => t.trips.transfers,
    icon: CarFront,
    permissions: [PERMISSIONS.TRANSFERS_READ],
    count: (c) => c.traveler.transferBookings.length,
    content: TravelerTransfersTab,
  },
  {
    key: 'excursions',
    label: (t) => t.trips.excursions,
    icon: Ship,
    permissions: [PERMISSIONS.EXCURSIONS_READ],
    count: (c) => c.traveler.excursionBookings.length,
    content: TravelerExcursionsTab,
  },
  {
    key: 'visa',
    label: (t) => t.trips.visa,
    icon: Globe2,
    permissions: [PERMISSIONS.VISAS_READ],
    count: (c) => c.traveler.visaOrders.length,
    content: TravelerVisasTab,
  },
];
