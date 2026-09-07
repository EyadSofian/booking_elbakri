'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, TripFileStatus } from '@elbakri/shared';
import { api } from '@/lib/api-client';
import { useI18n, useSession } from '@/lib/providers';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { Badge, statusVariant } from '@/components/ui/badge';
import { TabBar, TabPanel, useActiveTab, useResolvedTabs } from '@/components/layout/tabs';
import { TRIP_TABS } from '@/components/trips/tab-registry';
import type { TripDetail, TripTabContext } from '@/components/trips/types';

/**
 * Trip File detail.
 *
 * This page owns identity, the header, the tab registry and tab routing. The
 * content of each tab lives in its own module under `components/trips/tabs`,
 * so this file stays readable as the trip file grows.
 */
function TripDetailContent() {
  const params = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const { can } = useSession();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['trip', params.id],
    queryFn: () => api.get<TripDetail>(`/trips/${params.id}`),
  });

  const trip = query.data;
  const context = useMemo<TripTabContext>(() => ({ trip: trip as TripDetail }), [trip]);

  const tabs = useResolvedTabs(TRIP_TABS, context, Boolean(trip));
  const { active, activeKey, setTab } = useActiveTab(tabs);

  const changeStatus = useMutation({
    mutationFn: (status: string) => api.post(`/trips/${params.id}/status`, { status }),
    onSuccess: () => {
      toast.success(t.common.save);
      void queryClient.invalidateQueries({ queryKey: ['trip', params.id] });
    },
    onError: (err) => toast.error(errorLabel(err, t)),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-10 w-full max-w-xl" />
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="rounded-lg border bg-card px-6 py-12 text-center">
        <p className="text-sm font-medium">{t.errors.NOT_FOUND}</p>
        <Link href="/trips" className="mt-2 inline-block text-xs text-primary hover:underline">
          {t.trips.title}
        </Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        guideKey="page.trips"
        breadcrumb={
          <Link href="/trips" className="hover:text-foreground">
            {t.trips.title}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{trip.reference}</span>
            <Badge variant={statusVariant(trip.status)}>
              {t.status[trip.status as keyof typeof t.status] ?? trip.status}
            </Badge>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span>{trip.leadTraveler?.fullName ?? '—'}</span>
            {trip.partner ? <span>· {trip.partner.name}</span> : null}
            <span>
              · {formatDate(trip.travelStartDate, locale)} – {formatDate(trip.travelEndDate, locale)}
            </span>
          </span>
        }
        actions={
          can(PERMISSIONS.TRIPS_UPDATE) ? (
            <select
              value=""
              onChange={(e) => e.target.value && changeStatus.mutate(e.target.value)}
              disabled={changeStatus.isPending}
              className="h-8 rounded-md border border-input bg-surface px-2 text-xs"
              aria-label={t.common.status}
            >
              <option value="">{t.common.status}…</option>
              {Object.values(TripFileStatus)
                .filter((s) => s !== trip.status)
                .map((s) => (
                  <option key={s} value={s}>
                    {t.status[s as keyof typeof t.status] ?? s}
                  </option>
                ))}
            </select>
          ) : null
        }
      />

      {trip.legacySource?.workbook ? (
        <div className="mb-3 flex items-start gap-2 rounded-md border bg-info-subtle/50 px-3 py-2 text-xs text-info">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {t.common.source}: {trip.legacySource.workbook} · {trip.legacySource.sheet} ·{' '}
            {t.dataQuality.sourceRow} {trip.legacySource.row}
          </span>
        </div>
      ) : null}

      <TabBar tabs={tabs} activeKey={activeKey} onSelect={setTab} />
      <TabPanel tab={active} context={context} />
    </>
  );
}

export default function TripDetailPage() {
  // useSearchParams (via useActiveTab) needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<div className="skeleton h-40 w-full" />}>
      <TripDetailContent />
    </Suspense>
  );
}

/** Maps a server error code to its localised message. Not a hook. */
function errorLabel(error: unknown, t: ReturnType<typeof useI18n>['t']): string {
  const code = (error as { code?: string })?.code;
  return (code && (t.errors as Record<string, string>)[code]) || t.errors.INTERNAL_ERROR;
}
