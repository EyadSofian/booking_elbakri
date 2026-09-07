'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building2, Hotel as HotelIcon, Info, LayoutDashboard, RefreshCw, Tags,
} from 'lucide-react';
import { PERMISSIONS } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { formatDate, formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/empty-state';
import { HelpNotice, HelpTip } from '@/components/help/help-tip';
import {
  TabBar, TabPanel, useActiveTab, useResolvedTabs, type TabDefinition,
} from '@/components/layout/tabs';

interface HotelDetail {
  id: string;
  name: string;
  nameAr: string | null;
  city: string | null;
  area: string | null;
  starRating: number | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  hotelGroupName: string | null;
  region: string | null;
  subRegion: string | null;
  description: string | null;
  facilities: string | null;
  childPolicyDefault: string | null;
  transferNotesDefault: string | null;
  sourceSystem: string | null;
  externalId: string | null;
  externalStatus: string | null;
  externalUpdatedAt: string | null;
  lastSyncedAt: string | null;
  syncStatus: string;
  aliases: Array<{ id: string; alias: string; status: string; source: string | null }>;
  locations: Array<{ id: string; name: string; kind: string }>;
  _count: { bookings: number; staySegments: number; excursionBookings: number };
  recentBookings: Array<{
    id: string; reference: string; status: string;
    tripFile: { id: string; reference: string } | null;
    leadTraveler: { id: string; fullName: string } | null;
    staySegments: Array<{ checkIn: string | null; checkOut: string | null; nights: number | null }>;
  }>;
}

interface Ctx { hotel: HotelDetail }

function Field({ label, children, helpKey }: {
  label: string; children: React.ReactNode; helpKey?: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-2xs uppercase tracking-wide text-muted-foreground">
        {label}
        {helpKey ? <HelpTip helpKey={helpKey} label={label} /> : null}
      </dt>
      <dd className="mt-0.5 text-xs">{children ?? '—'}</dd>
    </div>
  );
}

function OverviewTab({ context }: { context: Ctx }) {
  const { hotel } = context;
  const { t, locale } = useI18n();
  return (
    <Card>
      <CardContent className="pt-3">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t.masterData.canonicalName}>
            {(locale === 'ar' && hotel.nameAr) || hotel.name}
          </Field>
          <Field label={t.hotelDirectory.group}>{hotel.hotelGroupName}</Field>
          <Field label={t.hotelDirectory.region}>{hotel.region ?? hotel.city}</Field>
          <Field label={t.hotelDirectory.subRegion}>{hotel.subRegion ?? hotel.area}</Field>
          <Field label={t.hotelDirectory.stars}>
            {hotel.starRating ? `${hotel.starRating}★` : null}
          </Field>
          <Field label={t.common.status}>
            <Badge variant={hotel.isActive ? 'success' : 'default'}>
              {hotel.isActive ? t.users.active : t.users.inactive}
            </Badge>
          </Field>
          <Field label={t.common.phone}>
            <span dir="ltr">{hotel.phone}</span>
          </Field>
          <Field label={t.auth.email}>
            <span dir="ltr">{hotel.email}</span>
          </Field>
          <Field label={t.hotelDirectory.bookingUsage}>
            <span className="tabular-nums">{hotel._count.bookings}</span>
          </Field>
        </dl>
      </CardContent>
    </Card>
  );
}

function DetailsTab({ context }: { context: Ctx }) {
  const { hotel } = context;
  const { t } = useI18n();
  const hasAny = hotel.description || hotel.facilities || hotel.address
    || hotel.childPolicyDefault || hotel.transferNotesDefault;

  if (!hasAny) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Info}
            title={t.hotelDirectory.noDescription}
            description={t.hotelDirectory.notConfigured}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-3">
        {hotel.description ? (
          <Field label={t.common.notes}>
            <p className="whitespace-pre-line leading-relaxed">{hotel.description}</p>
          </Field>
        ) : null}
        {hotel.address ? <Field label={t.common.name}>{hotel.address}</Field> : null}
        {hotel.facilities ? (
          <Field label={t.hotelDirectory.facilities}>
            <p className="whitespace-pre-line leading-relaxed">{hotel.facilities}</p>
          </Field>
        ) : null}
        {hotel.childPolicyDefault ? (
          <Field label={t.hotelDirectory.childPolicy}>
            <p className="whitespace-pre-line leading-relaxed">{hotel.childPolicyDefault}</p>
          </Field>
        ) : null}
        {hotel.transferNotesDefault ? (
          <Field label={t.hotelDirectory.transferNotes}>
            <p className="whitespace-pre-line leading-relaxed">{hotel.transferNotesDefault}</p>
          </Field>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AliasesTab({ context }: { context: Ctx }) {
  const { hotel } = context;
  const { t } = useI18n();
  return (
    <Card>
      <CardContent className="p-0">
        {hotel.aliases.length === 0 ? (
          <EmptyState
            icon={Tags}
            title={t.masterData.aliases}
            description={t.masterData.allResolvedHint}
          />
        ) : (
          <ul className="divide-y">
            {hotel.aliases.map((alias) => (
              <li key={alias.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <code className="font-mono text-xs">{alias.alias}</code>
                <span className="flex items-center gap-1.5">
                  {alias.source ? (
                    <span className="text-2xs text-muted-foreground">{alias.source}</span>
                  ) : null}
                  <Badge variant={alias.status === 'APPROVED' ? 'success' : 'default'}>
                    {t.status[alias.status as keyof typeof t.status] ?? alias.status}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function UsageTab({ context }: { context: Ctx }) {
  const { hotel } = context;
  const { t, locale } = useI18n();

  if (hotel.recentBookings.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={HotelIcon}
            title={t.hotelDirectory.noUsage}
            description={t.hotelDirectory.noUsageHint}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.trips.tripFile}</th>
                <th>{t.trips.leadTraveler}</th>
                <th>{t.hotels.checkIn}</th>
                <th>{t.hotels.checkOut}</th>
                <th>{t.hotels.nights}</th>
                <th>{t.common.status}</th>
              </tr>
            </thead>
            <tbody>
              {hotel.recentBookings.map((booking) => {
                const stay = booking.staySegments[0];
                return (
                  <tr key={booking.id}>
                    <td>
                      {booking.tripFile ? (
                        <Link
                          href={`/trips/${booking.tripFile.id}`}
                          className="tabular-nums text-primary hover:underline"
                        >
                          {booking.tripFile.reference}
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="max-w-48 truncate">{booking.leadTraveler?.fullName ?? '—'}</td>
                    <td className="tabular-nums">{formatDate(stay?.checkIn ?? null, locale)}</td>
                    <td className="tabular-nums">{formatDate(stay?.checkOut ?? null, locale)}</td>
                    <td className="tabular-nums">{stay?.nights ?? '—'}</td>
                    <td>
                      <Badge variant={statusVariant(booking.status)}>
                        {t.status[booking.status as keyof typeof t.status] ?? booking.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SyncTab({ context }: { context: Ctx }) {
  const { hotel } = context;
  const { t, locale } = useI18n();
  return (
    <>
      <HelpNotice noticeKey="notice.hotelDirectorySource" />
      <Card>
        <CardContent className="pt-3">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label={t.hotelDirectory.source}>
              {hotel.sourceSystem ?? t.hotelDirectory.localOnly}
            </Field>
            <Field label={t.hotelDirectory.externalId} helpKey="field.externalId">
              {hotel.externalId ? <span className="font-mono">{hotel.externalId}</span> : null}
            </Field>
            <Field label={t.hotelDirectory.syncStatus} helpKey="field.syncStatus">
              <Badge
                variant={
                  hotel.syncStatus === 'LINKED'
                    ? 'success'
                    : hotel.syncStatus === 'NEEDS_MATCH'
                      ? 'warning'
                      : 'default'
                }
              >
                {t.syncStatus[hotel.syncStatus as keyof typeof t.syncStatus] ?? hotel.syncStatus}
              </Badge>
            </Field>
            <Field label={t.hotelDirectory.externalStatus}>{hotel.externalStatus}</Field>
            <Field label={t.hotelDirectory.lastSync}>
              {hotel.lastSyncedAt ? formatDateTime(hotel.lastSyncedAt, locale) : null}
            </Field>
            <Field label={t.common.date}>
              {hotel.externalUpdatedAt ? formatDateTime(hotel.externalUpdatedAt, locale) : null}
            </Field>
          </dl>

          {hotel.locations.length ? (
            <div className="mt-4 border-t pt-3">
              <p className="mb-1.5 text-2xs uppercase tracking-wide text-muted-foreground">
                {t.nav.locations}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {hotel.locations.map((loc) => (
                  <Badge key={loc.id} variant="outline">{loc.name}</Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

/**
 * Hotel detail tabs.
 *
 * There is no Prices, Rates or Packages tab, and there never should be: those
 * belong to the Rate Hub. This system holds hotel identity and description.
 */
const HOTEL_TABS: TabDefinition<Ctx>[] = [
  { key: 'overview', label: (t) => t.hotelDirectory.overview, icon: LayoutDashboard, content: OverviewTab },
  { key: 'details', label: (t) => t.hotelDirectory.details, icon: Info, content: DetailsTab },
  {
    key: 'aliases', label: (t) => t.hotelDirectory.aliasesMatching, icon: Tags,
    count: (c) => c.hotel.aliases.length, helpKey: 'field.alias', content: AliasesTab,
  },
  {
    key: 'usage', label: (t) => t.hotelDirectory.bookingUsage, icon: Building2,
    permissions: [PERMISSIONS.HOTELS_READ],
    count: (c) => c.hotel._count.bookings, content: UsageTab,
  },
  {
    key: 'sync', label: (t) => t.hotelDirectory.syncInformation, icon: RefreshCw,
    helpKey: 'field.syncStatus', content: SyncTab,
  },
];

function HotelDetailContent() {
  const params = useParams<{ id: string }>();
  const { t, locale } = useI18n();

  const query = useQuery({
    queryKey: ['hotel', params.id],
    queryFn: () => api.get<HotelDetail>(`/hotels/${params.id}`),
  });

  const hotel = query.data;
  const context = useMemo<Ctx>(() => ({ hotel: hotel as HotelDetail }), [hotel]);
  const tabs = useResolvedTabs(HOTEL_TABS, context, Boolean(hotel));
  const { active, activeKey, setTab } = useActiveTab(tabs);

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-10 w-full max-w-xl" />
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }

  if (!hotel) {
    return (
      <div className="rounded-lg border bg-card px-6 py-12 text-center">
        <p className="text-sm font-medium">{t.errors.NOT_FOUND}</p>
        <Link href="/master-data/hotels" className="mt-2 inline-block text-xs text-primary hover:underline">
          {t.nav.hotels}
        </Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        guideKey="page.hotels"
        breadcrumb={
          <Link href="/master-data/hotels" className="hover:text-foreground">
            {t.nav.hotels}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span>{(locale === 'ar' && hotel.nameAr) || hotel.name}</span>
            {hotel.starRating ? <Badge variant="outline">{hotel.starRating}★</Badge> : null}
            {!hotel.isActive ? <Badge variant="default">{t.users.inactive}</Badge> : null}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3">
            {hotel.hotelGroupName ? <span>{hotel.hotelGroupName}</span> : null}
            {hotel.region ?? hotel.city ? <span>· {hotel.region ?? hotel.city}</span> : null}
            <span>· {hotel._count.bookings} {t.hotelDirectory.bookingUsage.toLowerCase()}</span>
          </span>
        }
      />

      <TabBar tabs={tabs} activeKey={activeKey} onSelect={setTab} />
      <TabPanel tab={active} context={context} />
    </>
  );
}

export default function HotelDetailPage() {
  return (
    <Suspense fallback={<div className="skeleton h-40 w-full" />}>
      <HotelDetailContent />
    </Suspense>
  );
}
