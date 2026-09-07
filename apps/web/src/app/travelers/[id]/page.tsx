'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useI18n } from '@/lib/providers';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { TabBar, TabPanel, useActiveTab, useResolvedTabs } from '@/components/layout/tabs';
import { TRAVELER_TABS } from '@/components/travelers/tab-registry';
import type { TravelerDetail, TravelerTabContext } from '@/components/travelers/types';

function TravelerDetailContent() {
  const params = useParams<{ id: string }>();
  const { t, locale } = useI18n();

  const query = useQuery({
    queryKey: ['traveler', params.id],
    queryFn: () => api.get<TravelerDetail>(`/travelers/${params.id}`),
  });

  const traveler = query.data;
  const context = useMemo<TravelerTabContext>(
    () => ({ traveler: traveler as TravelerDetail }),
    [traveler],
  );

  const tabs = useResolvedTabs(TRAVELER_TABS, context);
  const { active, activeKey, setTab } = useActiveTab(tabs);

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-10 w-full max-w-md" />
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }

  if (!traveler) {
    return (
      <div className="rounded-lg border bg-card px-6 py-12 text-center">
        <p className="text-sm font-medium">{t.errors.NOT_FOUND}</p>
        <Link href="/travelers" className="mt-2 inline-block text-xs text-primary hover:underline">
          {t.nav.travelers}
        </Link>
      </div>
    );
  }

  const serviceCount =
    traveler.hotelBookings.length +
    traveler.transferBookings.length +
    traveler.excursionBookings.length +
    traveler.visaOrders.length;

  return (
    <>
      <PageHeader
        guideKey="page.travelers"
        breadcrumb={
          <Link href="/travelers" className="hover:text-foreground">
            {t.nav.travelers}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span>{(locale === 'ar' && traveler.fullNameAr) || traveler.fullName}</span>
            {traveler.nationality ? (
              <Badge variant="outline">
                {(locale === 'ar' ? traveler.nationality.nameAr : traveler.nationality.name) ??
                  traveler.nationality.name}
              </Badge>
            ) : null}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span dir="ltr" className="tabular-nums">
              {traveler.phoneNormalized ?? traveler.phoneRaw ?? '—'}
            </span>
            {traveler.partner ? <span>· {traveler.partner.name}</span> : null}
            <span>
              · {traveler.tripsAsLead.length} {t.nav.tripFiles.toLowerCase()} · {serviceCount}{' '}
              {t.trips.services.toLowerCase()}
            </span>
          </span>
        }
      />

      {traveler.importRun ? (
        <div className="mb-3 flex items-start gap-2 rounded-md border bg-info-subtle/50 px-3 py-2 text-xs text-info">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {t.common.source}: {traveler.importRun.sourceFilename} ·{' '}
            {formatDate(traveler.createdAt, locale)}
          </span>
        </div>
      ) : null}

      <TabBar tabs={tabs} activeKey={activeKey} onSelect={setTab} />
      <TabPanel tab={active} context={context} />
    </>
  );
}

export default function TravelerDetailPage() {
  return (
    <Suspense fallback={<div className="skeleton h-40 w-full" />}>
      <TravelerDetailContent />
    </Suspense>
  );
}
